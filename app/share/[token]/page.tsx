import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getNotesRepository } from "@/src/lib/notes-repository";
import { NoteBody } from "@/src/components/note-body";

async function PublicNote({ params }: PageProps<"/share/[token]">) {
  await connection();
  const { token } = await params;
  const note = getNotesRepository().publicNote(token);
  if (!note) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm text-foreground/60">Shared note · Read only</p>
      <h1 className="mb-8 break-words text-3xl font-semibold tracking-tight">{note.title}</h1>
      <div className="note-prose">
        <NoteBody content={note.content} />
      </div>
    </article>
  );
}
export default function SharedNotePage(props: PageProps<"/share/[token]">) {
  return (
    <Suspense fallback={<p role="status">Loading shared note…</p>}>
      <PublicNote {...props} />
    </Suspense>
  );
}
