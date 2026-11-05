import type { SavedNote } from "./note-types";

export type NoteEditorProps = {
  id: string;
  accountId: string;
  initialNote: SavedNote | null;
  shareUrl: string | null;
};
export type EditorSession = { path: string; props: NoteEditorProps };

// Route refreshes retain local edits. Actual navigation starts a separate editor,
// except for the draft's own transition from /new to its newly persisted ID.
export function resolveEditorSession(
  current: EditorSession,
  path: string,
  incoming: NoteEditorProps,
  newId = () => crypto.randomUUID(),
): EditorSession | null {
  if (path === current.path) return current;
  if (current.path === "/notes/new" && path === `/notes/${current.props.id}`)
    return { ...current, path };
  if (path === "/notes/new")
    return {
      path,
      props: {
        id:
          incoming.initialNote === null && incoming.id !== current.props.id ? incoming.id : newId(),
        accountId: incoming.accountId,
        initialNote: null,
        shareUrl: null,
      },
    };
  // usePathname can update before the destination's Server Component props arrive.
  if (path !== `/notes/${incoming.id}` || !incoming.initialNote) return null;
  return { path, props: incoming };
}
