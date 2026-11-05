import { Suspense } from "react";
import { AuthForm } from "@/src/components/auth-form";
import { getSession } from "@/src/lib/session";
import { redirect } from "next/navigation";

async function Content() {
  if (await getSession()) redirect("/notes");
  return <AuthForm mode="login" />;
}

export default function SignInPage() {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>
      <Content />
    </Suspense>
  );
}
