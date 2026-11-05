import type { Database } from "bun:sqlite";
import { NoteFailure, validateContent } from "./note-content";
import type { NoteDraft, NoteSummary, SavedNote } from "./note-types";

type Row = {
  id: string;
  title: string;
  content_json: string;
  revision: number;
  created_at: number;
  updated_at: number;
  share_token: string | null;
};
function saved(row: Row): SavedNote {
  return {
    id: row.id,
    title: row.title,
    content: validateContent(JSON.parse(row.content_json)),
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The caller supplies a verified session identity; this module never accepts ownership from a draft.
export function notesStore(database: Database) {
  function ownerRow(userId: string, id: string): Row | null {
    return database
      .query<Row, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?")
      .get(id, userId);
  }
  function required(userId: string, id: string): Row {
    const row = ownerRow(userId, id);
    if (!row) throw new NoteFailure("NOT_FOUND", "Note not found.");
    return row;
  }
  return {
    list(userId: string): NoteSummary[] {
      return database
        .query<NoteSummary, [string]>(
          "SELECT id, title, updated_at AS updatedAt FROM notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        )
        .all(userId);
    },
    get(userId: string, id: string) {
      const row = ownerRow(userId, id);
      return row ? { note: saved(row), shareToken: row.share_token } : null;
    },
    create(userId: string, id: string, draft: NoteDraft): SavedNote {
      return database
        .transaction(() => {
          const existing = ownerRow(userId, id);
          if (existing) return saved(existing);
          if (database.query("SELECT id FROM notes WHERE id = ?").get(id))
            throw new NoteFailure("NOT_FOUND", "Note not found.");
          const now = Date.now();
          database
            .query(
              "INSERT INTO notes (id,user_id,title,content_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
            )
            .run(id, userId, draft.title, JSON.stringify(draft.content), now, now);
          return saved(required(userId, id));
        })
        .immediate();
    },
    update(userId: string, id: string, revision: number, draft: NoteDraft): SavedNote {
      return database
        .transaction(() => {
          const result = database
            .query(
              "UPDATE notes SET title = ?, content_json = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND user_id = ? AND revision = ?",
            )
            .run(draft.title, JSON.stringify(draft.content), Date.now(), id, userId, revision);
          const row = required(userId, id);
          if (!result.changes)
            throw new NoteFailure(
              "CONFLICT",
              "This note changed elsewhere. Your draft has been kept.",
            );
          return saved(row);
        })
        .immediate();
    },
    remove(userId: string, id: string): void {
      if (!database.query("DELETE FROM notes WHERE id = ? AND user_id = ?").run(id, userId).changes)
        throw new NoteFailure("NOT_FOUND", "Note not found.");
    },
    share(userId: string, id: string, enabled: boolean): string | null {
      return database
        .transaction(() => {
          const row = required(userId, id);
          const token = enabled
            ? (row.share_token ??
              Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))
            : null;
          database
            .query("UPDATE notes SET share_token = ? WHERE id = ? AND user_id = ?")
            .run(token, id, userId);
          return token;
        })
        .immediate();
    },
    publicNote(token: string): NoteDraft | null {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const row = database
        .query<{ title: string; content_json: string }, [string]>(
          "SELECT title, content_json FROM notes WHERE share_token = ?",
        )
        .get(token);
      return row
        ? { title: row.title, content: validateContent(JSON.parse(row.content_json)) }
        : null;
    },
  };
}
