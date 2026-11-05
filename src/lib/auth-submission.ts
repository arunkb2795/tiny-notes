import { APIError } from "better-auth/api";
import type { AuthFormState } from "./auth-form-state";

export function createAuthLimiter(now = Date.now) {
  const entries = new Map<string, { count: number; expires: number }>();
  return (email: string) => {
    const time = now();
    for (const [key, entry] of entries) if (entry.expires <= time) entries.delete(key);
    const entry = entries.get(email);
    if (entry) {
      if (entry.count >= 10) return false;
      entry.count++;
    } else {
      // Fail closed at capacity rather than evicting an active limit.
      if (entries.size >= 10_000) return false;
      entries.set(email, { count: 1, expires: time + 60_000 });
    }
    return true;
  };
}

const allowAttempt = createAuthLimiter();
type Credentials = { name: string; email: string; password: string };

export async function submitAuth(
  mode: "login" | "register",
  form: FormData,
  authenticate: (credentials: Credentials) => Promise<unknown>,
  allow = allowAttempt,
): Promise<AuthFormState | null> {
  const string = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const name = string("name").trim();
  const email = string("email").trim().toLowerCase();
  const password = string("password");
  const values = { name: name.slice(0, 200), email: email.slice(0, 254) };
  const failure = (code: string, message: string): AuthFormState => ({
    ok: false,
    error: { code, message },
    values,
  });

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return failure("VALIDATION_ERROR", "Enter a valid email address.");
  if (!allow(email))
    return failure("RATE_LIMITED", "Too many attempts. Please try again in a minute.");
  if (!password || password.length > 128)
    return failure("VALIDATION_ERROR", "Enter a password of at most 128 characters.");
  if (mode === "register") {
    if (!name || name.length > 200)
      return failure("VALIDATION_ERROR", "Enter a name of at most 200 characters.");
    if (password.length < 8)
      return failure("VALIDATION_ERROR", "Use at least 8 characters for your password.");
    if (password !== string("confirmPassword"))
      return failure("VALIDATION_ERROR", "Passwords must match.");
  }
  try {
    await authenticate({ name, email, password });
    return null;
  } catch (error) {
    if (error instanceof APIError) {
      if (error.statusCode === 429)
        return failure("RATE_LIMITED", "Too many attempts. Please try again in a minute.");
      if (error.statusCode >= 400 && error.statusCode < 500) {
        if (mode === "login") return failure("AUTHENTICATION_FAILED", "Invalid email or password.");
        if (
          error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
          error.body?.code === "USER_ALREADY_EXISTS"
        )
          return failure(
            "EMAIL_IN_USE",
            "An account with this email already exists. Please log in.",
          );
        return failure("VALIDATION_ERROR", "Unable to register. Check your details and try again.");
      }
    }
    const requestId = crypto.randomUUID();
    console.error({ requestId, operation: mode, category: "AUTH_INTERNAL_ERROR" });
    return { ...failure("INTERNAL_ERROR", "Something went wrong. Please try again."), requestId };
  }
}
