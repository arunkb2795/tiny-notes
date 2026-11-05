import Link from "next/link";

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
          {/* Replace guest links with session-aware navigation when auth is added. */}
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
        </nav>
      </div>
    </header>
  );
}
