import "server-only";
import { betterAuth } from "better-auth";
import { authOptions } from "./auth-options";
import { getDatabase } from "./db";

let auth: ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>> | undefined;

export function getAuth() {
  if (auth) return auth;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!baseURL) throw new Error("BETTER_AUTH_URL is required.");
  const url = new URL(baseURL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("BETTER_AUTH_URL must be an HTTP origin, with HTTPS in production.");
  }
  auth = betterAuth(authOptions(getDatabase(), secret, url.origin));
  return auth;
}
