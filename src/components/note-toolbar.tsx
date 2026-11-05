"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import type { ChangeEvent, MouseEvent, ReactElement } from "react";
import { isSafeLink } from "@/src/lib/note-content";

const commands = [
  ["bold", "Bold", "B"],
  ["italic", "Italic", "I"],
  ["strike", "Strikethrough", "S"],
  ["bulletList", "Bullet list", "• List"],
  ["orderedList", "Numbered list", "1. List"],
  ["blockquote", "Blockquote", "❝"],
  ["code", "Inline code", "<>"],
  ["codeBlock", "Code block", "{ }"],
] as const;

export function NoteToolbar({ editor }: { editor: Editor | null }): ReactElement {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            active: commands.filter(([name]) => current.isActive(name)).map(([name]) => name),
            heading: [1, 2, 3].find((level) => current.isActive("heading", { level })) ?? 0,
            link: current.isActive("link"),
          }
        : null,
  });
  function handleHeading(event: ChangeEvent<HTMLSelectElement>): void {
    if (!editor) return;
    const level = Number(event.target.value);
    if (level === 1 || level === 2 || level === 3)
      editor.chain().focus().setHeading({ level }).run();
    else editor.chain().focus().setParagraph().run();
  }
  function handleFormat(event: MouseEvent<HTMLButtonElement>): void {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (event.currentTarget.dataset.command) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
    }
  }
  function handleLink(): void {
    if (!editor) return;
    const href = window.prompt(
      "Link URL (https://, http://, or /path). Leave empty to remove.",
      String(editor.getAttributes("link").href ?? ""),
    );
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isSafeLink(href.trim())) {
      window.alert("Enter a safe http://, https://, or /path link.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }
  function handleBreak(): void {
    editor?.chain().focus().setHardBreak().run();
  }
  function handleUndo(): void {
    editor?.chain().focus().undo().run();
  }
  function handleRedo(): void {
    editor?.chain().focus().redo().run();
  }
  return (
    <div
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-foreground/15 p-2"
    >
      <select
        aria-label="Text style"
        value={state?.heading ?? 0}
        onChange={handleHeading}
        disabled={!editor}
        className="min-h-11 rounded-md bg-background px-2 text-sm"
      >
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      {commands.map(([name, label, text]) => (
        <button
          key={name}
          type="button"
          className="editor-tool"
          aria-label={label}
          title={label}
          aria-pressed={state?.active.includes(name) ?? false}
          data-command={name}
          onClick={handleFormat}
          disabled={!editor}
        >
          {text}
        </button>
      ))}
      <button
        type="button"
        className="editor-tool"
        aria-pressed={state?.link ?? false}
        onClick={handleLink}
        disabled={!editor}
      >
        Link
      </button>
      <button
        type="button"
        className="editor-tool"
        onClick={handleBreak}
        disabled={!editor}
        aria-label="Hard break"
      >
        ↵
      </button>
      <button
        type="button"
        className="editor-tool"
        onClick={handleUndo}
        disabled={!editor?.can().undo()}
        aria-label="Undo"
      >
        ↶
      </button>
      <button
        type="button"
        className="editor-tool"
        onClick={handleRedo}
        disabled={!editor?.can().redo()}
        aria-label="Redo"
      >
        ↷
      </button>
    </div>
  );
}
