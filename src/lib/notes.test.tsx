import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import {
  emptyContent,
  isSafeLink,
  noteExtensions,
  validateContent,
  validateDraft,
} from "./note-content";
import { notesStore } from "./notes-store";
import { createNoteLimiter } from "./note-limiter";
import { NoteBody } from "../components/note-body";

const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
async function fixture() {
  const database = new Database(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(await Bun.file(new URL("../../migrations/001_auth.sql", import.meta.url)).text());
  database.exec(await Bun.file(new URL("../../migrations/002_notes.sql", import.meta.url)).text());
  for (const id of ["alice", "bob"])
    database
      .query(
        'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,0,?,?)',
      )
      .run(id, id, `${id}@example.com`, Date.now(), Date.now());
  return {
    database,
    store: notesStore(database),
    id: crypto.randomUUID(),
    draft: validateDraft({ title: "  First note  ", content: emptyContent }),
  };
}

describe("note persistence and ownership", () => {
  test("create is retry-safe, list is owner-only metadata, updates are atomic and revisioned", async () => {
    const { store, id, draft } = await fixture();
    const created = store.create("alice", id, draft);
    expect(created.title).toBe("First note");
    expect(store.create("alice", id, { ...draft, title: "Do not overwrite" })).toEqual(created);
    expect(store.list("alice")).toEqual([
      { id, title: created.title, updatedAt: created.updatedAt },
    ]);
    expect(store.list("bob")).toEqual([]);
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body", marks: [{ type: "bold" }] }] },
      ],
    };
    const updated = store.update("alice", id, 1, { title: "Updated", content });
    expect(updated.revision).toBe(2);
    expect(store.get("alice", id)?.note).toEqual(updated);
    expect(() => store.update("alice", id, 1, draft)).toThrow("changed elsewhere");
    expect(store.get("alice", id)?.note.title).toBe("Updated");
    expect(store.get("alice", id)?.note.content).toEqual(content);
  });
  test("all owner operations hide another user's note", async () => {
    const { store, id, draft } = await fixture();
    store.create("alice", id, draft);
    expect(store.get("bob", id)).toBeNull();
    for (const attempt of [
      () => store.create("bob", id, draft),
      () => store.update("bob", id, 1, draft),
      () => store.remove("bob", id),
      () => store.share("bob", id, true),
      () => store.share("bob", id, false),
    ])
      expect(attempt).toThrow("Note not found");
    expect(store.get("alice", id)?.note.title).toBe("First note");
  });
  test("tokens are random, stable while enabled, revoked and rotated; delete revokes public access", async () => {
    const { store, id, draft } = await fixture();
    store.create("alice", id, draft);
    expect(store.get("alice", id)?.shareToken).toBeNull();
    const token = store.share("alice", id, true) ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url").length).toBe(32);
    expect(store.share("alice", id, true)).toBe(token);
    expect(store.publicNote(token)).toEqual(draft);
    store.share("alice", id, false);
    expect(store.publicNote(token)).toBeNull();
    const next = store.share("alice", id, true) ?? "";
    expect(next).not.toBe(token);
    store.remove("alice", id);
    expect(store.publicNote(next)).toBeNull();
    expect(store.get("alice", id)).toBeNull();
  });
  test("fixed descending order and foreign keys", async () => {
    const { database, store, id, draft } = await fixture();
    const otherId = crypto.randomUUID();
    store.create("alice", id, draft);
    store.create("alice", otherId, draft);
    database.query("UPDATE notes SET updated_at = 10 WHERE id = ?").run(id);
    database.query("UPDATE notes SET updated_at = 20 WHERE id = ?").run(otherId);
    expect(store.list("alice").map((note) => note.id)).toEqual([otherId, id]);
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

describe("rich text boundary", () => {
  test("rejects invalid titles, unsupported nodes, marks, attributes, and malformed schema", () => {
    for (const title of ["", "   ", "x".repeat(121), null])
      expect(() => validateDraft({ title, content: emptyContent })).toThrow("title");
    const invalid = [
      null,
      {},
      { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] },
      { type: "doc", content: [{ type: "text", text: "invalid block" }] },
      { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "alert(1)" } }] },
      { type: "doc", content: [{ type: "heading", attrs: { level: 4 } }] },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "underline" }] }],
          },
        ],
      },
    ];
    for (const content of invalid) expect(() => validateContent(content)).toThrow();
  });
  test("bounds UTF-8 size and nesting", () => {
    expect(() =>
      validateContent({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "😀".repeat(26_000) }] }],
      }),
    ).toThrow("100 KiB");
    let deep = emptyContent;
    for (let i = 0; i < 66; i++) deep = { type: "blockquote", content: [deep] };
    expect(() => validateContent({ type: "doc", content: [deep] })).toThrow();
  });
  test("safe links and escaped public rendering", () => {
    for (const link of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.test",
      "/\\evil.test",
      "https://user:pass@evil.test",
      "java\nscript:alert(1)",
    ])
      expect(isSafeLink(link)).toBe(false);
    for (const link of ["https://example.com", "http://example.com/path", "/notes"])
      expect(isSafeLink(link)).toBe(true);
    const content = validateContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "<script>alert(1)</script>",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    });
    const html = renderToStaticMarkup(
      renderToReactElement({ extensions: noteExtensions(), content }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('rel="noopener noreferrer"');
    const linkWithNullRel = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com", target: "_blank", rel: null },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(renderToStaticMarkup(<NoteBody content={linkWithNullRel} />)).toContain(
      'rel="noopener noreferrer"',
    );
    expect(() =>
      validateContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  test("rate limits are per account and expire", () => {
    let now = 0;
    const allow = createNoteLimiter(() => now);
    for (let i = 0; i < 120; i++) expect(allow("alice")).toBe(true);
    expect(allow("alice")).toBe(false);
    expect(allow("bob")).toBe(true);
    now = 60_000;
    expect(allow("alice")).toBe(true);
  });
});
