# Tiny Notes

Next.js App Router scaffold using React, TypeScript, Tailwind CSS, and Bun.
See [SPEC.md](SPEC.md) for MVP requirements. Authentication routes and note
access are not implemented yet; database migrations are available now.

## Local setup

Use Bun **1.4.4** and install dependencies with `bun install`. Copy `.env.example`
to `.env` and set `DATABASE_PATH` to a writable SQLite file. Relative paths are
resolved from the project root, regardless of the command's working directory.
Missing parent directories are created automatically. Bun loads `.env`.

```sh
bun run db:migrate
bun run dev
```

Open http://localhost:3000. Migrations are explicit deployment commands, never
run by application requests. Auth secrets and origins will be needed when live
authentication is implemented; this migration tooling does not need them.

## Up and Down migrations

```sh
bun run db:migrate           # Up: apply every pending migration
bun run db:migrate -- up     # Same operation explicitly
bun run db:migrate -- down   # Down: reverse only the latest applied migration
bun run migrate:up          # Alias for Up
bun run migrate:down        # Alias for one Down migration
```

**Down permanently deletes data when its SQL drops tables. Back up the database
before rolling back.** Repeating Down reverses earlier migrations one at a time.
Up can reapply rolled-back migrations, but cannot restore their deleted data.

The runner uses `bun:sqlite`, foreign keys, WAL, and a 5-second busy timeout. It
applies forward SQL files in lexical filename order and records filename stems
with epoch-millisecond timestamps in `schema_migrations`. Applied versions must
be a prefix of available migrations. The history table remains after a full
rollback. Repeating Up or Down with no work remaining is a no-op.

Each migration and its history update run in one synchronous immediate transaction.
A failure rolls back that migration and stops the command with a nonzero exit
status; earlier successful migrations remain committed. History is checked again
inside the write transaction. Run deployment migrations from one process at a time.

For future changes, add `migrations/003_description.sql` and the matching
`migrations/down/003_description.sql`. Every forward file must have a rollback
file and vice versa. Treat applied SQL files as immutable; add a new version to
change deployed schemas. SQL files are trusted, reviewed source code. They must
be transaction-compatible: do not include `BEGIN`, `COMMIT`, `END TRANSACTION`,
`ROLLBACK`, savepoint commands, `VACUUM`, or connection-changing pragmas. Keep
connection configuration in the runner. Each file contains only its direction's
schema/data changes.

## Auth schema provenance

`better-auth` and its `auth` CLI are both pinned to **1.7.17**. The initial auth
migration was generated with the Bun SQLite, email/password-only configuration
in `scripts/auth-schema.ts`:

```sh
bunx --bun auth@1.7.17 generate --config ./scripts/auth-schema.ts --output ./migrations/001_auth.sql --yes
```

This config uses an isolated in-memory database; generation never opens
`DATABASE_PATH`. Checked-in SQL preserves the generator's exact schema:
auth timestamps have `date` declarations, `emailVerified` has no SQL default,
and there is no provider/account composite unique constraint. These differ from
the spec's illustrative DDL; the pinned generator is authoritative. Notes
timestamps remain epoch milliseconds in `INTEGER` columns.

Tests compare the auth migration with freshly generated SQL and check for schema
differences after applying it. On upgrades, generate into a temporary review file,
compare the changes, and commit a new migration rather than overwriting an applied
migration. Do not use `@latest` or automatic Better Auth migrations in production.

## Validation and deployment

```sh
bun run test
bun run lint
bun run format:check
bun tsc --noEmit
bun run build
```

`bun run typecheck` is also available. `bun run lint` runs Oxlint followed by the
existing Next.js ESLint checks. Use `bun run format` to format with Oxfmt or
`bun run format:check` to check formatting without modifying files. Generated
output, the lockfile, and versioned SQL migrations are excluded from formatting.

Deploy on a single Bun-compatible persistent server with writable SQLite disk
and HTTPS. Run Up before starting the application. Keep databases outside
`public/`, do not commit databases or secrets, and use WAL-aware backups
(SQLite's backup API or a clean shutdown before copying the database). Do not
use ephemeral/serverless storage or the Edge runtime.
