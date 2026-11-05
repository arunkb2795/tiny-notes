import type { Database } from "bun:sqlite";
import { nextCookies } from "better-auth/next-js";

export function authOptions(database: Database, secret: string, baseURL: string) {
  const origin = new URL(baseURL).origin;
  return {
    database,
    secret,
    baseURL,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: { cookieCache: { enabled: false } },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    rateLimit: { enabled: true, storage: "memory" as const },
    // Errors are mapped and logged safely by the application boundary.
    logger: { disabled: true },
    plugins: [nextCookies()],
  };
}
