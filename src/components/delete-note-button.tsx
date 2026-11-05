"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { deleteNoteAction } from "@/app/actions/notes";
import type { NoteIdentity } from "@/src/lib/note-types";
import type { NoteAutosave } from "@/src/lib/note-autosave";

export function DeleteNoteButton({
  identity,
  controller,
}: {
  identity: NoteIdentity;
  controller?: NoteAutosave;
}): ReactElement {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function handleDelete(): void {
    if (!window.confirm("Permanently delete this note? This cannot be undone.")) return;
    startTransition(async () => {
      await controller?.pause();
      try {
        const result = await deleteNoteAction(identity);
        if (!result.ok) {
          setError(result.error.message);
          controller?.resume();
          return;
        }
        // Discard is intentional after the explicit deletion confirmation.
        controller?.dispose();
        window.dispatchEvent(new Event("tiny-notes:discard"));
        router.push("/notes");
      } catch {
        setError("Couldn't delete. Please try again.");
        controller?.resume();
      }
    });
  }
  return (
    <div>
      <button
        type="button"
        className="min-h-11 rounded-md px-3 text-sm text-red-700 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
        onClick={handleDelete}
        disabled={pending}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
