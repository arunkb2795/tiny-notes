import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { NoteDraft, NoteErrorCode } from "./note-types";

export const emptyContent: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function isSafeLink(value: string): boolean {
  if (
    !value ||
    [...value].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === "\\",
    )
  )
    return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function noteExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      horizontalRule: false,
      underline: false,
      link: {
        openOnClick: false,
        isAllowedUri: isSafeLink,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
  ];
}

const schema = getSchema(noteExtensions());
const nodes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
]);
const marks = new Set(["bold", "italic", "strike", "code", "link"]);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validAttributes(type: string, value: unknown): boolean {
  if (value === undefined) return type !== "heading" && type !== "link";
  if (!record(value)) return false;
  switch (type) {
    case "heading":
      return (
        onlyKeys(value, ["level"]) &&
        [1, 2, 3].includes(Number(value.level)) &&
        typeof value.level === "number"
      );
    case "orderedList":
      return (
        onlyKeys(value, ["start", "type"]) &&
        (value.start === undefined ||
          (Number.isSafeInteger(value.start) && Number(value.start) >= 1)) &&
        (value.type === undefined || value.type === null || value.type === "1")
      );
    case "codeBlock":
      return (
        onlyKeys(value, ["language"]) &&
        (value.language === null ||
          value.language === undefined ||
          (typeof value.language === "string" && /^[\w+-]{1,40}$/.test(value.language)))
      );
    case "link":
      return (
        onlyKeys(value, ["href", "target", "rel", "class"]) &&
        typeof value.href === "string" &&
        isSafeLink(value.href) &&
        [undefined, null, "_blank", "_self"].includes(value.target as undefined | null | string) &&
        (value.rel === undefined ||
          value.rel === null ||
          value.rel === "noopener noreferrer" ||
          value.rel === "noopener noreferrer nofollow") &&
        (value.class === undefined || value.class === null)
      );
    default:
      return Object.keys(value).length === 0;
  }
}
function validNode(value: unknown, depth = 0): value is JSONContent {
  if (
    depth > 64 ||
    !record(value) ||
    !onlyKeys(value, ["type", "attrs", "content", "marks", "text"])
  )
    return false;
  if (
    typeof value.type !== "string" ||
    !nodes.has(value.type) ||
    !validAttributes(value.type, value.attrs)
  )
    return false;
  if (value.text !== undefined && (value.type !== "text" || typeof value.text !== "string"))
    return false;
  if (
    value.marks !== undefined &&
    (!Array.isArray(value.marks) ||
      !value.marks.every(
        (mark: unknown) =>
          record(mark) &&
          onlyKeys(mark, ["type", "attrs"]) &&
          typeof mark.type === "string" &&
          marks.has(mark.type) &&
          validAttributes(mark.type, mark.attrs),
      ))
  )
    return false;
  return (
    value.content === undefined ||
    (Array.isArray(value.content) &&
      value.content.every((child: unknown) => validNode(child, depth + 1)))
  );
}
export class NoteFailure extends Error {
  constructor(
    public code: NoteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function validateContent(content: unknown): JSONContent {
  // Walk first to bound recursion before serializing or passing into ProseMirror.
  if (!validNode(content) || content.type !== "doc")
    throw new NoteFailure("VALIDATION_ERROR", "This note contains unsupported formatting.");
  const serialized = JSON.stringify(content);
  if (new TextEncoder().encode(serialized).byteLength > 100 * 1024)
    throw new NoteFailure("CONTENT_TOO_LARGE", "Notes can contain at most 100 KiB of rich text.");
  try {
    schema.nodeFromJSON(content).check();
  } catch {
    throw new NoteFailure("VALIDATION_ERROR", "This note contains invalid rich text.");
  }
  return content;
}
export function validateDraft(input: unknown): NoteDraft {
  if (
    !record(input) ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.trim().length > 120
  )
    throw new NoteFailure("VALIDATION_ERROR", "Enter a title of 1–120 characters.");
  return { title: input.title.trim(), content: validateContent(input.content) };
}
