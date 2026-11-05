import type { JSONContent } from "@tiptap/core";

export type NoteDraft = { title: string; content: JSONContent };
export type SavedNote = NoteDraft & {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
export type NoteSummary = Pick<SavedNote, "id" | "title" | "updatedAt">;
export type NoteErrorCode =
  | "VALIDATION_ERROR"
  | "CONTENT_TOO_LARGE"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
export type NoteResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: NoteErrorCode; message: string };
      requestId?: string;
    };
export type NoteIdentity = { id: string; accountId: string };
export type SaveNoteInput = NoteIdentity & NoteDraft & { revision?: number };
