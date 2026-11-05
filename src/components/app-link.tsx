"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useNotesNavigation } from "./notes-navigation-provider";

function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span role="status" className="ml-2 inline-block min-w-3 text-xs">
      {pending ? "…" : ""}
      <span className="sr-only">{pending ? "Opening page" : ""}</span>
    </span>
  );
}
export function AppLink({
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string }) {
  const navigation = useNotesNavigation();
  const router = useRouter();
  function handleNavigate(event: { preventDefault(): void }): void {
    if (navigation.isBusy()) {
      event.preventDefault();
      return;
    }
    if (!navigation.needsSave()) return;
    event.preventDefault();
    void navigation.request(() => {
      router.push(href);
    }, href);
  }
  return (
    <Link {...props} href={href} onNavigate={handleNavigate}>
      {children}
      <PendingHint />
    </Link>
  );
}
