import "server-only";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const databaseGlobal = globalThis as typeof globalThis & { tinyNotesDatabase?: Database };

export function getDatabase() {
  if (databaseGlobal.tinyNotesDatabase) return databaseGlobal.tinyNotesDatabase;
  const path = process.env.DATABASE_PATH?.trim();
  if (!path) throw new Error("DATABASE_PATH is required.");
  // The database is provisioned separately; it must not be traced into build output.
  const database = new Database(resolve(/* turbopackIgnore: true */ process.cwd(), path), {
    create: false,
    strict: true,
  });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  databaseGlobal.tinyNotesDatabase = database;
  return database;
}
