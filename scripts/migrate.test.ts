import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate, parseDirection } from "./migrate";
import { getMigrations } from "better-auth/db/migration";

const directories: string[] = [];
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "tinynotes-migrations-"));
  directories.push(directory);
  return directory;
}
function inspect<T>(path: string, callback: (db: Database) => T): T {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  try {
    return callback(db);
  } finally {
    db.close();
  }
}
function history(path: string) {
  return inspect(path, (db) =>
    db.query("SELECT version FROM schema_migrations ORDER BY version").values().flat(),
  );
}
function fixture() {
  const directory = temporary();
  const migrationsDirectory = join(directory, "migrations");
  mkdirSync(join(migrationsDirectory, "down"), { recursive: true });
  const options = { databasePath: join(directory, "test.sqlite"), migrationsDirectory };
  const add = (version: string, up: string, down: string) => {
    writeFileSync(join(migrationsDirectory, `${version}.sql`), up);
    writeFileSync(join(migrationsDirectory, "down", `${version}.sql`), down);
  };
  return { ...options, add };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("migration CLI", () => {
  test("defaults to Up and accepts explicit directions", () => {
    expect(parseDirection([])).toBe("up");
    expect(parseDirection(["up"])).toBe("up");
    expect(parseDirection(["--", "down"])).toBe("down");
    expect(() => parseDirection(["reset"])).toThrow("Usage");
    expect(() => parseDirection(["down", "up"])).toThrow("Usage");
  });

  test("rejects missing database paths", () => {
    expect(() => migrate({ databasePath: undefined })).toThrow("DATABASE_PATH");
    expect(() => migrate({ databasePath: " " })).toThrow("DATABASE_PATH");
  });

  test("CLI errors exit nonzero before opening a database", () => {
    const result = Bun.spawnSync([process.execPath, resolve("scripts/migrate.ts"), "invalid"], {
      env: { ...process.env, DATABASE_PATH: "" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Usage");
  });
});

test("real schemas support Up, repeat Up, single Down, full rollback, and reapply", () => {
  const databasePath = join(temporary(), "nested", "test.sqlite");
  const options = { databasePath };
  expect(migrate(options)).toEqual(["001_auth", "002_notes"]);
  expect(migrate(options)).toEqual([]);
  inspect(databasePath, (db) => {
    expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(
      db
        .query("SELECT applied_at FROM schema_migrations")
        .values()
        .flat()
        .every((value) => typeof value === "number" && value > 1_000_000_000_000),
    ).toBe(true);
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name);
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "notes",
      "schema_migrations",
    ]) {
      expect(tables).toContain(table);
    }
    db.query(
      'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)',
    ).run("owner", "Owner", "owner@example.com", 0, Date.now(), Date.now());
    const insert = db.query(
      "INSERT INTO notes (id, user_id, title, content_json, share_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("a", "owner", "Title", "{}", null, 1, 1);
    insert.run("b", "owner", "Title", "{}", null, 1, 1);
    insert.run("c", "owner", "Title", "{}", "shared", 1, 1);
    expect(() => insert.run("d", "owner", "Title", "{}", "shared", 1, 1)).toThrow();
    expect(() => insert.run("e", "missing", "Title", "{}", null, 1, 1)).toThrow();
    for (const title of [" ", "x".repeat(121)]) {
      expect(() => insert.run("f", "owner", title, "{}", null, 1, 1)).toThrow();
    }
    expect(() => db.exec("UPDATE notes SET revision = 0")).toThrow();
    expect(db.query("SELECT revision FROM notes WHERE id = 'a'").get()).toEqual({ revision: 1 });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    db.query('DELETE FROM "user" WHERE id = ?').run("owner");
    expect(db.query("SELECT count(*) AS count FROM notes").get()).toEqual({ count: 0 });
  });
  expect(migrate({ ...options, direction: "down" })).toEqual(["002_notes"]);
  expect(history(databasePath)).toEqual(["001_auth"]);
  inspect(databasePath, (db) => {
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE name IN ('notes', 'idx_notes_user_updated', 'idx_notes_share_token')",
        )
        .all(),
    ).toEqual([]);
  });
  expect(migrate({ ...options, direction: "down" })).toEqual(["001_auth"]);
  expect(history(databasePath)).toEqual([]);
  expect(migrate({ ...options, direction: "down" })).toEqual([]);
  expect(migrate(options)).toEqual(["001_auth", "002_notes"]);
});

test("failed Up rolls back DDL and history and stops subsequent migrations", () => {
  const options = fixture();
  options.add("001_ok", "CREATE TABLE first (id INTEGER);", "DROP TABLE first;");
  options.add(
    "002_bad",
    "CREATE TABLE second (id INTEGER); INSERT INTO missing VALUES (1);",
    "DROP TABLE second;",
  );
  options.add("003_later", "CREATE TABLE later (id INTEGER);", "DROP TABLE later;");
  expect(() => migrate(options)).toThrow();
  expect(history(options.databasePath)).toEqual(["001_ok"]);
  inspect(options.databasePath, (db) => {
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name IN ('second', 'later')").all(),
    ).toEqual([]);
  });
});

test("failed Down preserves its table and history", () => {
  const options = fixture();
  options.add(
    "001_bad_down",
    "CREATE TABLE first (id INTEGER);",
    "DROP TABLE first; INSERT INTO missing VALUES (1);",
  );
  migrate(options);
  expect(() => migrate({ ...options, direction: "down" })).toThrow();
  expect(history(options.databasePath)).toEqual(["001_bad_down"]);
  inspect(options.databasePath, (db) => expect(db.query("SELECT * FROM first").all()).toEqual([]));
});

test("missing rollback files fail before creating a database", () => {
  const options = fixture();
  writeFileSync(
    join(options.migrationsDirectory, "001_missing.sql"),
    "CREATE TABLE first (id INTEGER);",
  );
  expect(() => migrate(options)).toThrow("matching Up and Down");
  expect(existsSync(options.databasePath)).toBe(false);
});

test("non-prefix and unknown history are rejected without changing history", () => {
  const options = fixture();
  options.add("001_first", "CREATE TABLE first (id INTEGER);", "DROP TABLE first;");
  options.add("002_second", "CREATE TABLE second (id INTEGER);", "DROP TABLE second;");
  migrate(options);
  inspect(options.databasePath, (db) =>
    db.exec("DELETE FROM schema_migrations WHERE version = '001_first'"),
  );
  expect(() => migrate(options)).toThrow("prefix");
  expect(history(options.databasePath)).toEqual(["002_second"]);
  inspect(options.databasePath, (db) =>
    db.exec("UPDATE schema_migrations SET version = 'unknown'"),
  );
  expect(() => migrate({ ...options, direction: "down" })).toThrow("prefix");
  expect(history(options.databasePath)).toEqual(["unknown"]);
});

test("checked-in auth SQL matches the pinned Better Auth generator", async () => {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  try {
    const options = { database: db, emailAndPassword: { enabled: true } };
    const generated = await getMigrations(options);
    expect((await generated.compileMigrations()).replaceAll("\r\n", "\n").trim()).toBe(
      readFileSync(resolve("migrations/001_auth.sql"), "utf8").replaceAll("\r\n", "\n").trim(),
    );
    db.exec(readFileSync(resolve("migrations/001_auth.sql"), "utf8"));
    const checked = await getMigrations(options);
    expect(checked.toBeCreated).toEqual([]);
    expect(checked.toBeAdded).toEqual([]);
    expect(checked.toBeAddedIndexes).toEqual([]);
    expect(checked.schemaProblems).toEqual([]);
    expect(checked.unsafeChanges).toEqual([]);
  } finally {
    db.close();
  }
});
