"use client";

import Link from "next/link";
import { useState, type ComponentProps, type FormEvent } from "react";

function AuthField({
  label,
  id,
  ...props
}: ComponentProps<"input"> & { label: string; id: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        {...props}
        id={id}
        required
        className="min-h-11 w-full rounded-md border border-foreground/25 bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      />
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const title = isRegister ? "Register" : "Login";
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const confirmation = form.elements.namedItem("confirmPassword");

    if (confirmation instanceof HTMLInputElement && fields.get("password") !== confirmation.value) {
      confirmation.setCustomValidity("Passwords must match.");
      confirmation.reportValidity();
      return;
    }

    // Replace with a Server Action once Better Auth is configured.
    setMessage("Authentication is not available yet. Please try again later.");
  }

  return (
    <main className="mx-auto w-full max-w-sm py-4 sm:py-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-foreground/70">
        {isRegister ? "Create your account to start taking notes." : "Welcome back to Tiny Notes."}
      </p>

      <form
        onSubmit={handleSubmit}
        onInput={(event) => {
          const confirmation = event.currentTarget.elements.namedItem("confirmPassword");
          if (confirmation instanceof HTMLInputElement) {
            confirmation.setCustomValidity("");
          }
        }}
        className="mt-8 space-y-5"
      >
        {isRegister && <AuthField label="Name" id="name" name="name" autoComplete="name" />}
        <AuthField
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <AuthField
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
          aria-describedby={isRegister ? "password-hint" : undefined}
        />
        {isRegister && (
          <>
            <p id="password-hint" className="text-sm text-foreground/70">
              Use at least 8 characters. Password recovery is unavailable, so keep your password
              somewhere safe.
            </p>
            <AuthField
              label="Confirm password"
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
            />
          </>
        )}
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-foreground px-4 py-2 font-medium text-background hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          {title}
        </button>
        <p role="status" className="text-sm text-foreground/70">
          {message}
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-foreground/70">
        {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
        <Link
          href={isRegister ? "/sign-in" : "/sign-up"}
          className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          {isRegister ? "Login" : "Register"}
        </Link>
      </p>
    </main>
  );
}
