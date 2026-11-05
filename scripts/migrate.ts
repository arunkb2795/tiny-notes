import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
type Direction = "up" | "down";
type Migration = { version: string; up: string; down: string };

export function parseDirection(args: string[]): Direction {
  const values = args[0] === "--" ? args.slice(1) : args;
  if (values.length === 0) return "up";
  if (values.length === 1 && (values[0] === "up" || values[0] === "down")) {
    return values[0];
  }
  throw new Error("Usage: bun run db:migrate [--] [up|down]");
}

function readMigrations(directory: string): Migration[] {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const downFiles = readdirSync(resolve(directory, "down"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (JSON.stringify(files) !== JSON.stringify(downFiles)) {
    throw new Error("Every migration must have matching Up and Down SQL files.");
  }
  return files.map((file) => ({
    version: file.slice(0, -4),
    up: readFileSync(resolve(directory, file), "utf8"),
    down: readFileSync(resolve(directory, "down", file), "utf8"),
  }));
}

function appliedVersions(db: Database, migrations: Migration[]): string[] {
  const versions = db
    .query<{ version: string }, []>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => row.version);
  if (versions.some((version, index) => version !== migrations[index]?.version)) {
    throw new Error("Applied migrations must form a prefix of available migrations.");
  }
  return versions;
}

export function migrate({
  direction = "up",
  databasePath,
  migrationsDirectory = resolve(projectRoot, "migrations"),
}: {
  direction?: Direction;
  databasePath: string | undefined;
  migrationsDirectory?: string;
}): string[] {
  if (!databasePath?.trim()) throw new Error("DATABASE_PATH is required.");
  const migrations = readMigrations(migrationsDirectory);
  const path = resolve(projectRoot, databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  const completed: string[] = [];
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    // Inspect history before bootstrapping so inconsistent databases are untouched.
    if (
      db
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
        .get()
    ) {
      appliedVersions(db, migrations);
    }
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    const step = db.transaction(() => {
      const versions = appliedVersions(db, migrations);
      const migration = migrations[direction === "up" ? versions.length : versions.length - 1];
      if (!migration) return false;
      db.exec(migration[direction]);
      if (direction === "up") {
        db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
          migration.version,
          Date.now(),
        );
      } else {
        db.query("DELETE FROM schema_migrations WHERE version = ?").run(migration.version);
      }
      return migration.version;
    });
    do {
      const version = step.immediate();
      if (!version) break;
      completed.push(version);
      console.log(`${direction === "up" ? "Applied" : "Reverted"} ${version}`);
    } while (direction === "up");
    return completed;
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  try {
    const direction = parseDirection(process.argv.slice(2));
    const completed = migrate({ direction, databasePath: process.env.DATABASE_PATH });
    if (completed.length === 0) console.log("No migrations to run.");
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  }
}
