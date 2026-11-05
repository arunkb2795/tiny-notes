import "server-only";
import { getDatabase } from "./db";
import { notesStore } from "./notes-store";

export function getNotesRepository() {
  return notesStore(getDatabase());
}
