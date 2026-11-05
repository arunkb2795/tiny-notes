"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/src/lib/auth";
import type { AuthFormState } from "@/src/lib/auth-form-state";
import { createAuthLimiter, submitAuth } from "@/src/lib/auth-submission";
import { getSession } from "@/src/lib/session";

const allowSignOut = createAuthLimiter();

export async function signOutAction(): Promise<AuthFormState> {
  try {
    const session = await getSession();
    if (session && !allowSignOut(session.user.id)) {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many attempts. Please try again in a minute.",
        },
      };
    }
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    const requestId = crypto.randomUUID();
    console.error({ requestId, operation: "logout", category: "AUTH_INTERNAL_ERROR" });
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Unable to log out. Please try again." },
      requestId,
    };
  }
  redirect("/sign-in");
}

export async function signInAction(_previous: AuthFormState | null, form: FormData) {
  const result = await submitAuth("login", form, async ({ email, password }) =>
    getAuth().api.signInEmail({ headers: await headers(), body: { email, password } }),
  );
  if (result) return result;
  redirect("/notes");
}

export async function signUpAction(_previous: AuthFormState | null, form: FormData) {
  const result = await submitAuth("register", form, async ({ name, email, password }) =>
    getAuth().api.signUpEmail({ headers: await headers(), body: { name, email, password } }),
  );
  if (result) return result;
  redirect("/notes");
}
