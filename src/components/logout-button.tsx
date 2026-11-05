"use client";

import { useState, useTransition, type FormEvent } from "react";
import { signOutAction } from "@/app/actions/auth";
import { useNotesNavigation } from "./notes-navigation-provider";

export function LogoutButton() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const navigation = useNotesNavigation();
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      await navigation.request(async () => {
        const result = await signOutAction();
        if (result) {
          setError(result.error.message);
          navigation.cancel();
        }
      }, "/sign-in");
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="relative">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground disabled:opacity-60"
      >
        {pending ? "Logging out…" : "Logout"}
      </button>
      {error && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-64 rounded-md border border-foreground/25 bg-background p-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}
    </form>
  );
}
