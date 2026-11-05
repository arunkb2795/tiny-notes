import { Suspense } from "react";
import { NotesSkeleton } from "@/src/components/notes-skeleton";
import { NoteEditor } from "@/src/components/note-editor";
import { requireSession } from "@/src/lib/session";

async function Content() {
  const session = await requireSession();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">New note</h1>
      <NoteEditor
        id={crypto.randomUUID()}
        accountId={session.user.id}
        initialNote={null}
        shareUrl={null}
      />
    </>
  );
}

export default function NewNotePage() {
  return (
    <Suspense fallback={<NotesSkeleton kind="editor" />}>
      <Content />
    </Suspense>
  );
}
