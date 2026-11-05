import { AppLink as Link } from "@/src/components/app-link";
import { NotesSkeleton } from "@/src/components/notes-skeleton";
import { Suspense } from "react";
import { requireSession } from "@/src/lib/session";
import { getNotesRepository } from "@/src/lib/notes-repository";
import { DeleteNoteButton } from "@/src/components/delete-note-button";

async function NotesList() {
  const session = await requireSession();
  const notes = getNotesRepository().list(session.user.id);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your notes</h1>
          <p className="mt-2 text-sm text-foreground/60">A little space for your thoughts.</p>
        </div>
        <Link href="/notes/new" className="note-button bg-foreground text-background">
          + New note
        </Link>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-foreground/25 px-6 py-16 text-center">
          <h2 className="text-xl font-medium">Your first note starts here</h2>
          <p className="mt-2 text-foreground/65">
            Create a note and your changes will save automatically.
          </p>
          <Link href="/notes/new" className="note-button mt-5">
            Create a note
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex flex-col rounded-xl border border-foreground/15 hover:border-foreground/35"
            >
              <Link href={`/notes/${note.id}`} className="flex-1 rounded-t-xl p-5">
                <h2 className="break-words text-lg font-medium">{note.title}</h2>
                <p className="mt-3 text-sm text-foreground/60">
                  Updated{" "}
                  <time dateTime={new Date(note.updatedAt).toISOString()}>
                    {new Date(note.updatedAt).toLocaleString("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                </p>
              </Link>
              <div className="flex justify-end px-2 pb-2">
                <DeleteNoteButton identity={{ id: note.id, accountId: session.user.id }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default function NotesPage() {
  return (
    <Suspense fallback={<NotesSkeleton kind="list" />}>
      <NotesList />
    </Suspense>
  );
}
