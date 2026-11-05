import { Suspense } from "react";
import { NotesSkeleton } from "@/src/components/notes-skeleton";
import { notFound } from "next/navigation";
import { getNotesRepository } from "@/src/lib/notes-repository";
import { NoteEditor } from "@/src/components/note-editor";
import { requireSession } from "@/src/lib/session";

async function Content({ params }: PageProps<"/notes/[id]">) {
  const session = await requireSession();
  const { id } = await params;
  const data = getNotesRepository().get(session.user.id, id);
  if (!data) notFound();
  const shareUrl = data.shareToken
    ? `${new URL(process.env.BETTER_AUTH_URL ?? "").origin}/share/${data.shareToken}`
    : null;
  return (
    <>
      <h1 className="sr-only">Edit note</h1>
      <NoteEditor id={id} accountId={session.user.id} initialNote={data.note} shareUrl={shareUrl} />
    </>
  );
}

export default function NotePage(props: PageProps<"/notes/[id]">) {
  return (
    <Suspense fallback={<NotesSkeleton kind="editor" />}>
      <Content {...props} />
    </Suspense>
  );
}
