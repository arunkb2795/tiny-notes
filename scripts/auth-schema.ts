import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";

// Schema-generation only: never opens the application database.
const database = new Database(":memory:");
database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

export const auth = betterAuth({
  database,
  emailAndPassword: { enabled: true },
});
