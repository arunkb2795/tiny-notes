import { Suspense } from "react";
import { PagePlaceholder } from "@/src/components/page-placeholder";
import { requireSession } from "@/src/lib/session";

async function Content() {
  await requireSession();
  return <PagePlaceholder heading="Note" description="Note editor page placeholder." />;
}

export default function NotePage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Content />
    </Suspense>
  );
}
