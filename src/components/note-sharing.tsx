"use client";

import { useState, useTransition, type FocusEvent, type ReactElement } from "react";
import { enableShareAction, disableShareAction } from "@/app/actions/notes";
import type { NoteIdentity } from "@/src/lib/note-types";

export function NoteSharing({
  identity,
  initialUrl,
}: {
  identity: NoteIdentity;
  initialUrl: string | null;
}): ReactElement {
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function handleToggle(): void {
    setMessage("");
    startTransition(async () => {
      try {
        if (url) {
          const result = await disableShareAction(identity);
          if (result.ok) setUrl(null);
          else setMessage(result.error.message);
        } else {
          const result = await enableShareAction(identity);
          if (result.ok) setUrl(result.data);
          else setMessage(result.error.message);
        }
      } catch {
        setMessage("Couldn't change sharing. Please try again.");
      }
    });
  }
  async function handleCopy(): Promise<void> {
    if (!url) return;
    try {
      if (!("clipboard" in navigator)) {
        setMessage("Select the link below to copy it.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link below to copy it.");
    }
  }
  function handleSelect(event: FocusEvent<HTMLInputElement>): void {
    event.currentTarget.select();
  }
  return (
    <section aria-label="Sharing" className="rounded-xl border border-foreground/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Public sharing</h2>
          <p className="text-sm text-foreground/65">
            {url
              ? "Anyone with the link can read the last saved version."
              : "Only you can access this note."}
          </p>
        </div>
        <button type="button" className="note-button" onClick={handleToggle} disabled={pending}>
          {pending ? "Updating…" : url ? "Disable sharing" : "Enable sharing"}
        </button>
      </div>
      {url && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            aria-label="Public note link"
            readOnly
            value={url}
            onFocus={handleSelect}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-foreground/20 bg-background px-3 text-sm"
          />
          <button type="button" className="note-button" onClick={handleCopy}>
            Copy link
          </button>
        </div>
      )}
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </section>
  );
}
