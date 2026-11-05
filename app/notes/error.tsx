"use client";

import Link from "next/link";

export default function NotesError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Couldn&apos;t open your notes</h1>
      <p>Please try again.</p>
      <button type="button" className="note-button" onClick={reset}>
        Retry
      </button>
      <Link href="/notes" className="note-button">
        Go to notes
      </Link>
    </div>
  );
}
