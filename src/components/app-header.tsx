import { AppLink as Link } from "./app-link";
import { Suspense } from "react";
import { getSession } from "@/src/lib/session";
import { LogoutButton } from "./logout-button";

async function AccountNavigation() {
  const session = await getSession();

  if (session) {
    return (
      <>
        <Link
          href="/notes"
          className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          Notes
        </Link>
        <LogoutButton />
      </>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        Login
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        Register
      </Link>
    </>
  );
}

export function AppHeader() {
  return (
    <header className="border-b border-foreground/15">
      <div className="mx-auto flex min-h-20 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center rounded-md text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          Tiny Notes
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-3">
          <Suspense fallback={null}>
            <AccountNavigation />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
