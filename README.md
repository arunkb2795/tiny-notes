# Tiny Notes

Next.js App Router scaffold using React, TypeScript, Tailwind CSS, and Bun.
See [SPEC.md](SPEC.md) for MVP requirements. Email/password registration and login are implemented with Better Auth Server
Actions. Each notes page checks its session in its own Server Component. Notes
enforce ownership on every read and mutation. The header shows Notes and
Logout for signed-in users, or Login and Register for guests. Logout revokes the
current session and redirects to `/sign-in`.

## Notes

The authenticated `/notes` area lists only your notes, newest updated first. Create
a note at `/notes/new`, enter a title, and use the Tiptap toolbar to format its body.
Changes autosave after 800 ms or on editor blur. The Save button saves immediately
through the same queue and can retry failed saves. A title is required; empty bodies
are allowed. Notes are limited to 100 KiB of validated rich-text JSON.

Save status reflects server acknowledgements. Network failures retain the draft
in memory and offer Retry. Conflicts pause saving until you reload the server
version or keep your local draft for reference. Session expiry retains the draft;
sign in to the original account in another tab before retrying. Drafts are not
stored offline and are lost if you confirm leaving before they save.

App navigation and logout save pending edits before leaving. A progress notice
offers Stay here while saving; failures keep the draft open with an explicit,
confirmed Discard and leave option. Closing/reloading the browser still warns
about unsaved edits where supported. Links keep Next.js prefetching and show
pending feedback; list/editor skeletons reserve space during route loading.
Session reads are deduplicated only within a server request, never across users
or requests. Saves invalidate the list, while the editor consumes the save
acknowledgement without a second editor-route invalidation.

Delete permanently removes a note after confirmation. Public sharing is off by
default. Enable it in the editor to copy a read-only URL showing the last saved
version. Disabling immediately revokes the URL; enabling again creates a new one.
Sharing and notes are rendered on request and must not be cached by deployment
proxies. Use a single Bun server with the existing database migrations; no new
schema migration is required for these features.

## Local setup

Use Bun **1.4.4** and install dependencies with `bun install`. Copy `.env.example`
to `.env` and set `DATABASE_PATH` to a writable SQLite file. Relative paths are
resolved from the project root, regardless of the command's working directory.
The migration runner creates missing parent directories. Bun loads `.env`.
Set `BETTER_AUTH_URL=http://localhost:3000` and generate `BETTER_AUTH_SECRET`
with `bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"`. Keep
the secret stable and private; it must contain at least 32 characters.

```sh
bun run db:migrate
bun run dev
```

Open http://localhost:3000. Migrations are explicit deployment commands, never
run by application requests. The application opens an existing database and never applies migrations during
requests. Migration tooling only needs `DATABASE_PATH`. Dev, build, and start
scripts invoke Next.js’s CLI file directly with Bun so `bun:sqlite` remains
available. Avoid `next dev` or `node` directly. After changing these scripts,
stop any existing dev server and restart with `bun run dev`; hot reload cannot
change its runtime. Direct CLI invocation also avoids propagating `--bun`
through `NODE_OPTIONS` to Turbopack’s Node-based CSS workers on Windows.

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

## Authentication

Registration requires name, email, password (8–128 characters), and matching
confirmation. Signup automatically signs in; both forms redirect to `/notes`.
Password recovery and email verification are unavailable. Passwords are hashed
only by Better Auth. Sessions use HttpOnly cookies and database-backed checks.
Expired sessions redirect protected-page visitors to `/sign-in`; authenticated
visitors to either auth page redirect to `/notes`. Guards run in each page RSC,
never in layouts. No return-path query parameters are used.

For production, set `BETTER_AUTH_URL` to the exact HTTPS public origin and
keep `BETTER_AUTH_SECRET` stable across restarts. That origin is trusted for
auth requests; Next.js Server Action origin protections remain enabled.
Better Auth cookies are Secure in production. Requests must run under Bun,
never Edge. Run migrations before `bun run build` and `bun run start`.

Better Auth infrastructure endpoints have in-memory rate limiting enabled.
Server Actions separately allow ten attempts per normalized email per minute,
with bounded expiring storage. Limits reset on restart and are process-local,
matching the single-server deployment. Login failures are generic; unexpected
action failures return a correlation ID and log only that ID, operation, and
failure category. No credentials or raw errors are logged.
