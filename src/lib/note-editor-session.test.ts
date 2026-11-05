import { expect, test } from "bun:test";
import {
  resolveEditorSession,
  type EditorSession,
  type NoteEditorProps,
} from "./note-editor-session";
import { emptyContent } from "./note-content";

const previous: NoteEditorProps = {
  id: "previous",
  accountId: "alice",
  initialNote: {
    id: "previous",
    title: "Previous title",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Previous body", marks: [{ type: "bold" }] }],
        },
      ],
    },
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  },
  shareUrl: "https://example.com/share/previous",
};

test("Create note clears the previous title, rich text, sharing and editor identity even before new props arrive", () => {
  const current = { path: "/notes/previous", props: previous };
  const next = resolveEditorSession(current, "/notes/new", previous, () => "fresh-draft");
  expect(next?.props).toEqual({
    id: "fresh-draft",
    accountId: "alice",
    initialNote: null,
    shareUrl: null,
  });
  expect(next?.props.id).not.toBe(current.props.id);
  expect(next?.props.initialNote?.content ?? emptyContent).toEqual(emptyContent);
});

test("first save and server refresh preserve the same keyed editor, queued edits and selection", () => {
  const draft = { ...previous, id: "draft", initialNote: null, shareUrl: null };
  const current: EditorSession = { path: "/notes/new", props: draft };
  const refreshed = { ...draft, id: "another-generated-id" };
  expect(resolveEditorSession(current, "/notes/new", refreshed)).toBe(current);
  const created = resolveEditorSession(current, "/notes/draft", refreshed);
  expect(created?.props).toBe(draft);
  expect(created?.props.id).toBe("draft");
  if (!created) throw new Error("Expected created session");
  expect(resolveEditorSession(created, "/notes/draft", previous)).toBe(created);
  const next = resolveEditorSession(created, "/notes/new", refreshed);
  expect(next?.props.id).toBe(refreshed.id);
  expect(next?.props.initialNote).toBeNull();
});

test("switching existing notes waits for matching server props, then changes editor key", () => {
  const current = { path: "/notes/first", props: { ...previous, id: "first" } };
  expect(resolveEditorSession(current, "/notes/previous", current.props)).toBeNull();
  expect(resolveEditorSession(current, "/notes/previous", previous)?.props).toBe(previous);
});
