"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/src/lib/session";
import { getNotesRepository } from "@/src/lib/notes-repository";
import { NoteFailure, validateDraft } from "@/src/lib/note-content";
import { createNoteLimiter } from "@/src/lib/note-limiter";
import { runNoteMutation } from "@/src/lib/note-mutation";
import type { NoteIdentity, NoteResult, SaveNoteInput, SavedNote } from "@/src/lib/note-types";

const allowWrite = createNoteLimiter();
async function mutation<T>(
  input: NoteIdentity,
  operation: (userId: string) => T,
  invalidateList = true,
): Promise<NoteResult<T>> {
  return runNoteMutation(
    input,
    async () => (await getSession())?.user.id ?? null,
    allowWrite,
    (userId) => {
      const data = operation(userId);
      if (invalidateList) revalidatePath("/notes");
      return data;
    },
  );
}
export async function createNoteAction(input: SaveNoteInput): Promise<NoteResult<SavedNote>> {
  return mutation(input, (userId) =>
    getNotesRepository().create(userId, input.id, validateDraft(input)),
  );
}
export async function updateNoteAction(input: SaveNoteInput): Promise<NoteResult<SavedNote>> {
  return mutation(input, (userId) => {
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1)
      throw new NoteFailure("VALIDATION_ERROR", "Invalid note revision.");
    return getNotesRepository().update(
      userId,
      input.id,
      Number(input.revision),
      validateDraft(input),
    );
  });
}
export async function deleteNoteAction(input: NoteIdentity): Promise<NoteResult<null>> {
  return mutation(input, (userId) => {
    getNotesRepository().remove(userId, input.id);
    return null;
  });
}
export async function enableShareAction(input: NoteIdentity): Promise<NoteResult<string>> {
  return mutation(
    input,
    (userId) => {
      const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
      const token = getNotesRepository().share(userId, input.id, true);
      return `${origin}/share/${token}`;
    },
    false,
  );
}
export async function disableShareAction(input: NoteIdentity): Promise<NoteResult<null>> {
  return mutation(
    input,
    (userId) => {
      getNotesRepository().share(userId, input.id, false);
      return null;
    },
    false,
  );
}
