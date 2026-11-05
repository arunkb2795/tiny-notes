import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authOptions } from "./auth-options";
import { createAuthLimiter, submitAuth } from "./auth-submission";

const directory = mkdtempSync(join(tmpdir(), "tinynotes-auth-"));
const database = new Database(join(directory, "auth.sqlite"));
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
database.exec(readFileSync(new URL("../../migrations/001_auth.sql", import.meta.url), "utf8"));
const options = authOptions(
  database,
  "test-only-secret-with-at-least-thirty-two-characters",
  "http://localhost:3000",
);
const auth = betterAuth(options);
const password = " valid password ";
let cookie = "";
let userId = "";

afterAll(() => {
  database.close();
  Bun.gc(true);
  rmSync(directory, { recursive: true, force: true });
});

describe("Better Auth with existing Bun SQLite schema", () => {
  test("runtime options need no schema changes", async () => {
    const migrations = await getMigrations(options);
    expect(migrations.toBeCreated).toEqual([]);
    expect(migrations.toBeAdded).toEqual([]);
    expect(migrations.toBeAddedIndexes).toEqual([]);
    expect(migrations.schemaProblems).toEqual([]);
  });

  test("signup creates a hashed credential and a persistent session", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Test User", email: "test@example.com", password },
      returnHeaders: true,
    });
    userId = result.response.user.id;
    cookie = result.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token=");
    expect(result.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    const account = database
      .query<{ password: string; providerId: string }, []>(
        'SELECT password, "providerId" FROM account',
      )
      .get();
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe(password);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableRefresh: true },
    });
    expect(session?.user.id).toBe(userId);
    expect(session?.user.emailVerified).toBe(false);
    expect(database.query("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("duplicate registration and wrong or unknown credentials fail", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "Other", email: "test@example.com", password } }),
    ).rejects.toBeInstanceOf(APIError);
    for (const email of ["test@example.com", "missing@example.com"]) {
      await expect(
        auth.api.signInEmail({ body: { email, password: "incorrect-password" } }),
      ).rejects.toBeInstanceOf(APIError);
    }
  });

  test("logout clears cookies and revokes only the current session", async () => {
    const login = async () => {
      const result = await auth.api.signInEmail({
        body: { email: "test@example.com", password },
        returnHeaders: true,
      });
      return new Headers({
        cookie: result.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      });
    };
    const current = await login();
    const other = await login();
    const result = await auth.api.signOut({ headers: current, returnHeaders: true });
    expect(result.response.success).toBe(true);
    expect(result.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect(
      await auth.api.getSession({ headers: current, query: { disableRefresh: true } }),
    ).toBeNull();
    expect(
      (await auth.api.getSession({ headers: other, query: { disableRefresh: true } }))?.user.id,
    ).toBe(userId);
  });

  test("existing credentials sign in and expired sessions are rejected", async () => {
    const login = await auth.api.signInEmail({
      body: { email: "test@example.com", password },
      returnHeaders: true,
    });
    const headers = new Headers({
      cookie: login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    });
    expect((await auth.api.getSession({ headers, query: { disableRefresh: true } }))?.user.id).toBe(
      userId,
    );
    database.query('UPDATE session SET "expiresAt" = ? WHERE "userId" = ?').run(0, userId);
    expect(await auth.api.getSession({ headers, query: { disableRefresh: true } })).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: " Test User ",
    email: " TEST@example.com ",
    password,
    confirmPassword: password,
    ...overrides,
  }))
    data.set(key, value);
  return data;
}

test("submissions normalize identity while preserving passwords", async () => {
  let received: unknown;
  expect(
    await submitAuth(
      "register",
      form(),
      async (value) => {
        received = value;
      },
      () => true,
    ),
  ).toBeNull();
  expect(received).toEqual({ name: "Test User", email: "test@example.com", password });
});

test("server validation rejects malformed and mismatched inputs before authentication", async () => {
  const invalid: Record<string, string>[] = [
    { email: "bad" },
    { name: " " },
    { password: "short" },
    { confirmPassword: "different" },
    { password: "x".repeat(129) },
  ];
  for (const overrides of invalid) {
    let called = false;
    const result = await submitAuth(
      "register",
      form(overrides),
      async () => {
        called = true;
      },
      () => true,
    );
    expect(result?.error.code).toBe("VALIDATION_ERROR");
    expect(called).toBe(false);
    expect(JSON.stringify(result)).not.toContain(password);
  }
  const malformed = form();
  malformed.set("email", new Blob(["test@example.com"]));
  expect(
    (
      await submitAuth(
        "login",
        malformed,
        async () => {},
        () => true,
      )
    )?.error.code,
  ).toBe("VALIDATION_ERROR");
});

test("action limits share identity buckets and expire after a minute", async () => {
  let now = 0;
  const allow = createAuthLimiter(() => now);
  for (let i = 0; i < 10; i++) expect(allow("test@example.com")).toBe(true);
  expect(allow("test@example.com")).toBe(false);
  expect(
    (
      await submitAuth(
        "login",
        form(),
        async () => {
          throw new Error("must not run");
        },
        allow,
      )
    )?.error.code,
  ).toBe("RATE_LIMITED");
  now = 60_000;
  expect(allow("test@example.com")).toBe(true);
});

test("auth failures use safe messages and unexpected errors have correlation IDs", async () => {
  for (const code of ["INVALID_EMAIL_OR_PASSWORD", "USER_NOT_FOUND"]) {
    const result = await submitAuth(
      "login",
      form(),
      async () => {
        throw new APIError("UNAUTHORIZED", { code, message: "sensitive internal detail" });
      },
      () => true,
    );
    expect(result?.error).toEqual({
      code: "AUTHENTICATION_FAILED",
      message: "Invalid email or password.",
    });
  }
  const duplicate = await submitAuth(
    "register",
    form(),
    async () => {
      throw new APIError("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" });
    },
    () => true,
  );
  expect(duplicate?.error.code).toBe("EMAIL_IN_USE");
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await submitAuth(
      "login",
      form(),
      async () => {
        throw new Error("SELECT password FROM account; secret");
      },
      () => true,
    );
    expect(result?.error.code).toBe("INTERNAL_ERROR");
    expect(result?.requestId).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/SELECT|secret|stack/);
    expect(log).toHaveBeenCalledWith({
      requestId: result?.requestId,
      operation: "login",
      category: "AUTH_INTERNAL_ERROR",
    });
  } finally {
    log.mockRestore();
  }
});
