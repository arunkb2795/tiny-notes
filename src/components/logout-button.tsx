"use client";

import { useActionState } from "react";
import { signOutAction } from "@/app/actions/auth";

export function LogoutButton() {
  const [state, action, pending] = useActionState(signOutAction, null);

  return (
    <form action={action} aria-busy={pending} className="relative">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground disabled:opacity-60"
      >
        {pending ? "Logging out…" : "Logout"}
      </button>
      {state && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-64 rounded-md border border-foreground/25 bg-background p-3 text-sm text-foreground"
        >
          {state.error.message}
        </p>
      )}
    </form>
  );
}
