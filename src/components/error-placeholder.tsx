import { ERROR_PLACEHOLDER_TEXT } from "@/src/constants/text";
import { PagePlaceholder } from "./page-placeholder";

type ErrorPlaceholderProps = {
  notFound?: boolean;
};

export function ErrorPlaceholder({ notFound = false }: ErrorPlaceholderProps) {
  const text = notFound ? ERROR_PLACEHOLDER_TEXT.notFound : ERROR_PLACEHOLDER_TEXT.error;

  return <PagePlaceholder heading={text.heading} description={text.description} />;
}
