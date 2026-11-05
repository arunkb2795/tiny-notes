import { Suspense } from "react";
import { getSession } from "@/src/lib/session";
import { redirect } from "next/navigation";

async function Content() {
  return redirect((await getSession()) ? "/notes" : "/sign-in");
}

export default function HomePage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Content />
    </Suspense>
  );
}
