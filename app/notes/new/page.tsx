import { Suspense } from "react";
import { PagePlaceholder } from "@/src/components/page-placeholder";
import { requireSession } from "@/src/lib/session";

async function Content() {
  await requireSession();
  return <PagePlaceholder heading="New note" description="New note page placeholder." />;
}

export default function NewNotePage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Content />
    </Suspense>
  );
}
