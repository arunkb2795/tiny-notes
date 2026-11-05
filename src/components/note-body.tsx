import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { noteExtensions, validateContent } from "@/src/lib/note-content";

export function NoteBody({ content }: { content: JSONContent }): ReactNode {
  return renderToReactElement({
    extensions: noteExtensions(),
    content: validateContent(content),
    options: {
      markMapping: {
        link({ mark, children }) {
          return (
            <a href={String(mark.attrs.href)} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      },
    },
  });
}
