"use client";

import { AppLink as Link } from "./app-link";
import { usePathname } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import {
  startTransition,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactElement,
} from "react";
import { createNoteAction, updateNoteAction } from "@/app/actions/notes";
import { emptyContent, noteExtensions } from "@/src/lib/note-content";
import { NoteAutosave } from "@/src/lib/note-autosave";
import type { NoteResult, SaveNoteInput, SavedNote } from "@/src/lib/note-types";
import { NoteToolbar } from "./note-toolbar";
import { NoteSharing } from "./note-sharing";
import { DeleteNoteButton } from "./delete-note-button";
import { useDraftGuard } from "./use-draft-guard";
import { resolveEditorSession, type NoteEditorProps } from "@/src/lib/note-editor-session";
import { useNotesNavigation } from "./notes-navigation-provider";
import { NotesSkeleton } from "./notes-skeleton";

function transport(input: SaveNoteInput, creating: boolean): Promise<NoteResult<SavedNote>> {
  return new Promise((resolve, reject) => {
    startTransition(async () => {
      try {
        resolve(await (creating ? createNoteAction(input) : updateNoteAction(input)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function NoteEditor(props: NoteEditorProps): ReactElement {
  const path = usePathname();
  const [session, setSession] = useState(() => ({ path, props }));
  const next = resolveEditorSession(session, path, props);
  if (next && next !== session) setSession(next);
  if (!next) return <NotesSkeleton kind="editor" />;
  return <NoteEditorSession key={next.props.id} {...next.props} />;
}

function NoteEditorSession({
  id,
  accountId,
  initialNote,
  shareUrl,
}: NoteEditorProps): ReactElement {
  const [identity] = useState({ id, accountId });
  const [controller] = useState(
    () =>
      new NoteAutosave(
        identity,
        initialNote ?? { title: "", content: emptyContent },
        initialNote,
        transport,
        (createdId) => {
          // Next.js supports native history replacement; this retains the in-memory editor and save queue.
          window.history.replaceState(null, "", `/notes/${createdId}`);
        },
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const navigation = useNotesNavigation();
  const navigationState = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  const leaving = navigationState.phase === "saving" || navigationState.phase === "navigating";
  useDraftGuard(controller);
  const editor = useEditor({
    extensions: noteExtensions(),
    content: initialNote?.content ?? emptyContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    enableContentCheck: true,
    editorProps: {
      attributes: {
        class: "note-prose min-h-[55vh] p-5 sm:p-8 outline-none",
        role: "textbox",
        "aria-label": "Note content",
        "aria-multiline": "true",
      },
    },
    onUpdate({ editor: current }) {
      controller.edit({ title: controller.getSnapshot().draft.title, content: current.getJSON() });
    },
    onBlur() {
      void controller.flush();
    },
  });
  function handleTitle(event: ChangeEvent<HTMLInputElement>): void {
    controller.edit({ ...controller.getSnapshot().draft, title: event.target.value });
  }
  function handleBlur(): void {
    void controller.flush();
  }
  function handleSave(): void {
    void controller.saveNow();
  }
  function handleReload(): void {
    if (window.confirm("Discard your local draft and reload the last server-saved version?")) {
      window.dispatchEvent(new Event("tiny-notes:discard"));
      window.location.reload();
    }
  }
  function handleKeep(): void {
    editor?.commands.focus();
  }
  const status = state.error
    ? "Couldn't save"
    : state.saving
      ? "Saving…"
      : state.dirty
        ? "Unsaved changes"
        : state.saved
          ? "Saved"
          : "Add a title to start saving";
  return (
    <div className="space-y-5" inert={leaving} aria-busy={leaving}>
      <div className="flex items-center justify-between gap-3">
        <Link href="/notes" className="note-button">
          ← All notes
        </Link>
        {state.saved && <DeleteNoteButton identity={identity} controller={controller} />}
      </div>
      <div>
        <label htmlFor="note-title" className="mb-2 block text-sm font-medium">
          Title
        </label>
        <input
          id="note-title"
          value={state.draft.title}
          onChange={handleTitle}
          onBlur={handleBlur}
          maxLength={120}
          placeholder="Give your note a title"
          className="w-full rounded-xl border border-foreground/20 bg-background px-4 py-3 text-2xl font-semibold tracking-tight"
        />
      </div>
      <div className="space-y-3">
        <NoteToolbar editor={editor} />
        <div className="flex items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-sm text-foreground/65">
            {status}
          </p>
          <button
            type="button"
            className="note-button"
            onClick={handleSave}
            disabled={
              !state.dirty || state.saving || state.paused || state.error?.code === "CONFLICT"
            }
          >
            {state.saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {state.error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
        >
          <p>{state.error.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.error.code === "CONFLICT" ? (
              <>
                <button type="button" className="note-button" onClick={handleReload}>
                  Reload server version
                </button>
                <button type="button" className="note-button" onClick={handleKeep}>
                  Keep my draft
                </button>
              </>
            ) : (
              <button type="button" className="note-button" onClick={controller.retry}>
                Retry
              </button>
            )}
            {state.error.code === "UNAUTHENTICATED" && (
              <a href="/sign-in" target="_blank" rel="noopener noreferrer" className="note-button">
                Sign in in another tab
              </a>
            )}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-foreground/20 bg-foreground/[0.015] focus-within:ring-2 focus-within:ring-foreground/25">
        {!editor && (
          <p role="status" className="min-h-[55vh] p-8">
            Loading editor…
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
      {state.saved ? (
        <NoteSharing identity={identity} initialUrl={shareUrl} />
      ) : (
        <p className="text-sm text-foreground/60">
          Sharing becomes available after the first save.
        </p>
      )}
    </div>
  );
}
