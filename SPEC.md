# Tiny Notes — Implementation SPEC

**Version:** 2.1 · **Date:** 2026-11-03 · **Status:** Developer handoff · **Priority:** MVP only

## 1. Goal and scope

Build a **mobile-first, installable PWA** for personal rich-text notes. Anyone may register with email/password; signed-in users can create, read, edit, autosave, and permanently delete their own notes. A note can be shared through an anonymous read-only URL; the owner can revoke it. Notes are **Tiptap JSON stored in SQLite**, rendered as safe HTML. No image/file content.

**Stack:** Bun runtime and package manager, TypeScript, Next.js App Router, React, Tailwind CSS, Tiptap, Better Auth, and Bun's built-in `bun:sqlite`. **Raw parameterized SQL only** for application data; **no ORM/query builder** for app queries. Better Auth may use its internal adapter to handle its own authentication tables. Custom versioned SQL migrations control all schema changes.

**Not in MVP:** password reset, email verification/sending, social login, `/settings` route, account/profile editing, attachments/images/embeds, note collaboration, query parameters, search, filtering of any kind (including client-side filtering), pagination, user-selectable sorting, tags, folders, quotas, export, version history, offline note editing/sync, push notifications, analytics, or admin UI.

## 2. Locked product decisions

| Area         | Requirement                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registration | **Open**; name, unique email, password (minimum 8 characters). No email confirmation; warn on signup that password recovery is unavailable.                                                |
| Auth         | Better Auth email/password only; cookie sessions; signup signs user in. No custom password hashing or auth implementation.                                                                 |
| Data access  | All server mutations use React/Next.js **Server Functions (Server Actions)**; all data fetching runs in **React Server Components** through server-only data access.                       |
| Navigation   | Path segments only; no application query parameters, search, or filtering. `/notes` always shows all owner notes in fixed newest-updated-first order.                                      |
| Notes        | Separate required title (1–120 characters, trimmed) and valid rich-text JSON body (empty document allowed). Max serialized content **100 KiB** per note; **no per-user note-count quota**. |
| Saving       | **Autosave only**, not manual Save. Debounce **800 ms** after changes; flush on editor blur where possible. Explicit saving/saved/unsaved/error indicator and retry.                       |
| Sharing      | Off by default. Enabling creates a cryptographically random token; disabling deletes token and revokes prior URL; re-enabling issues a new token.                                          |
| Deletion     | Permanent, with confirmation.                                                                                                                                                              |
| Appearance   | System theme initially; light/dark toggle in app header; persist override locally. **No `/settings` page.**                                                                                |
| PWA          | Installable on Android and iOS; network required for notes/auth/share. No promise of offline editing or content availability.                                                              |
| Hosting      | Single Bun-compatible persistent server with writable SQLite disk; HTTPS in production.                                                                                                    |

## 3. Routes and UI

| Route            | Access        | Page / behavior                                                                                                                |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/`              | Anyone        | Redirect authenticated users to `/notes`, otherwise to `/sign-in`.                                                             |
| `/sign-up`       | Guest         | Name, email, password, confirmation, validation and recoverable error states.                                                  |
| `/sign-in`       | Guest         | Email/password, generic failed-login messaging.                                                                                |
| `/notes`         | Authenticated | Notes newest first, empty state, Create button, note cards, deletion confirmation, sign-out, theme toggle.                     |
| `/notes/new`     | Authenticated | Draft title + Tiptap editor; first valid edit creates note via autosave, then replaces route with `/notes/:id`.                |
| `/notes/[id]`    | Owner         | Editor, autosave status, share toggle/copy link, delete; never exposes another user's content.                                 |
| `/share/[token]` | Anyone        | Server-authorized, read-only rendered title/body, no editor controls; 404 for invalid/revoked token.                           |
| `not-found.tsx`  | Anyone        | Branded accessible **404** with safe navigation home/sign-in; includes invalid, revoked, missing, and unauthorized note cases. |
| `error.tsx`      | Contextual    | Friendly route error boundary with retry/navigation. Separate `global-error.tsx` for root failures.                            |

**No `/settings` route**, link, menu item, or redirect. On unauthenticated requests to protected pages, redirect to `/sign-in` with no return-path query parameter; successful sign-in/signup always redirects to `/notes`. Logged-in visitors to auth pages go to `/notes`.

**Mobile UI:** one-column layout, minimum comfortable touch targets (~44 px), bottom-safe-area spacing, readable editor, keyboard-friendly interactions, visible focus, accessible labels, and responsive desktop widening (desktop is supported, not blocked). Header carries theme/sign-out. Tiptap toolbar offers **paragraph, H1–H3, bold, italic, strike, bullet/ordered lists, blockquote, inline code, code block, hard break, and safe hyperlinks**; no image or file extensions.

## 4. Database design

Single SQLite DB path from `DATABASE_PATH`. Set `PRAGMA foreign_keys = ON` on **every connection**, `journal_mode = WAL`, and an appropriate busy timeout. Store app timestamps as **Unix epoch milliseconds in INTEGER**; serialize JSON as TEXT. Use `crypto.randomUUID()` for note IDs, and secure random bytes for share tokens. Use prepared/bound statements only; never interpolate user values into SQL.

### 4.1 Better Auth core schema

The four required table names are exactly **`user`, `session`, `account`, `verification`**. The following is the **logical SQLite schema** corresponding to the supplied official field list. **The pinned Better Auth version's generated SQL is the authority** for exact column names, timestamp encoding, indexes, defaults, and constraints; compare and apply that SQL as the **initial auth migration**, instead of assuming this illustrative DDL can replace the generator output. Nullable `image`, IP/user-agent, account credentials/tokens, and their expiry fields must remain nullable.

```sql
-- Logical reference; replace auth DDL with verified output from pinned Better Auth CLI.
CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE, "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE, "expiresAt" INTEGER NOT NULL,
  "ipAddress" TEXT, "userAgent" TEXT,
  "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accountId" TEXT NOT NULL, "providerId" TEXT NOT NULL,
  "accessToken" TEXT, "refreshToken" TEXT,
  "accessTokenExpiresAt" INTEGER, "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT, "idToken" TEXT, "password" TEXT,
  "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL,
  UNIQUE("providerId", "accountId")
);
CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY, "identifier" TEXT NOT NULL, "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL
);
-- Other supporting indexes/constraints MUST follow the pinned CLI's generated SQL.
```

**Auth specifics:** `emailVerified` is false without verification; `image` null. For password login, `account.providerId = 'credential'`, `account.accountId = user.id`, and `account.password` contains Better Auth's **hash**, never plaintext. OAuth token fields remain unused/null; the `verification` table is still created even though sending verification emails is disabled. Never write these four tables through application SQL; only Better Auth does so.

### 4.2 Application schema (migration SQL)

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  content_json TEXT NOT NULL,
  share_token TEXT, -- NULL means sharing disabled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE UNIQUE INDEX idx_notes_share_token ON notes(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

The partial unique index enforces one active note per share token while allowing many private notes (`NULL`). Ownership is always taken from the verified session, never request input. No separate sharing table is required: `share_token IS NULL` denotes private. The note body is stored only in `content_json`; **do not add `content_text`**, a persisted plain-text derivative, or a search index. Server Actions validate Tiptap JSON before storing. A note can be empty but must have a nonblank title before first persistence.

### 4.3 Migrations

- `migrations/001_auth.sql`: checked-in SQL produced and reviewed using **pinned** `bunx --bun auth@<pinned-version> generate` (Better Auth Bun SQLite support). Do not run mutable `@latest` in deployed builds.
- `migrations/002_notes.sql`: application table and indexes. `migrations/003_...sql` onward for future changes.
- `bun run db:migrate`: custom TypeScript migration runner using `bun:sqlite`, runs files lexically in order, in transactions when compatible, records completed versions, skips applied migrations, and **stops on failure**. No schema changes at request time.
- On each dependency upgrade that affects Better Auth, compare regenerated SQL against existing tables, commit a new migration, and validate schema against the pinned Better Auth configuration before deployment.

## 5. Authentication and authorization

Use `betterAuth({ database: new Database(DATABASE_PATH), emailAndPassword: { enabled: true }, ... })` with secure `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; mount Better Auth at `/api/auth/[...all]` using its documented Next.js route handler. Apply secure cookie settings and trusted origins for the deployment. Signup, sign-in, and sign-out must run through Server Actions calling Better Auth's server API with the incoming request headers. Configure Better Auth's Next.js cookie integration so session cookies are set/deleted correctly from actions. Do not use Better Auth browser mutation helpers or client session-fetching hooks. Read sessions server-side in Server Components and re-check sessions inside every protected Server Action. The mounted Better Auth handler is library infrastructure, not an alternative UI mutation or data-fetching path. Keep Bun/SQLite code **server-only**, never in client bundles or Edge runtime.

**Authorization:** list only `WHERE user_id = session.user.id`; read/edit/delete/share via `WHERE id = ? AND user_id = ?`; missing and non-owned records both behave as **404**. Public lookup only by active random `share_token`. Never rely on UI visibility or client-supplied `userId` for access control. Rate-limit authentication endpoints and write operations; use generic login failure messages to avoid user enumeration.

## 6. Server Components and Server Actions contract

### 6.1 Reads: React Server Components only

All data fetching (notes list, owner note, public shared note, and session) happens in async React Server Components through server-only repository/auth functions. Call SQLite directly through prepared statements; do not fetch this application's own HTTP endpoints. Pass only the required serializable data to interactive Client Components. The list returns metadata only, with no body or share-token leakage; the owner editor receives its saved title/body/revision and sharing state; public pages receive only the shared title/body.

Do not create `/api/notes` or `/api/shared` routes. No `useEffect()` + `fetch()`, browser `fetch`/Axios, SWR, React Query, client session fetching, or read-only Server Actions for loading data. Client Components are limited to interactions such as Tiptap, autosave scheduling, pending/error state, theme, and install guidance. Effects for browser lifecycle or local UI behavior are allowed; they must not fetch application data.

Routes take IDs/tokens from path segments only. Do not consume `searchParams` or implement query-parameter contracts, search fields, filters, pagination, or selectable sorting. Unexpected application query parameters are ignored and never affect data, navigation destinations, or UI behavior. Framework-managed transport parameters are internal Next.js behavior, not application features. Ownership predicates and active-token checks remain mandatory authorization rules.

### 6.2 Writes: Server Functions (Server Actions) only

Define async actions in dedicated modules with `'use server'`. Invoke them through form `action`/`formAction` or from Client Component event/debounce callbacks within a React transition. All server mutations, including authentication, use these actions; no custom mutation route handlers or manual HTTP requests.

| Server Action        | Input                               | Success                                                                                     |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `signUpAction`       | Name, email, password, confirmation | Better Auth creates user/session; redirect to `/notes`.                                     |
| `signInAction`       | Email, password                     | Better Auth creates session; redirect to `/notes`.                                          |
| `signOutAction`      | None                                | Better Auth ends session; redirect to `/sign-in`.                                           |
| `createNoteAction`   | `{title, content}`                  | Validate/insert owner note; return saved `{id,title,content,revision,createdAt,updatedAt}`. |
| `updateNoteAction`   | `{id,title,content,revision}`       | Atomic conditional update; return saved note and new revision.                              |
| `deleteNoteAction`   | `{id}`                              | Permanently delete owner note; return acknowledgement or redirect to `/notes`.              |
| `enableShareAction`  | `{id}`                              | Create token if none; return full public URL to owner only.                                 |
| `disableShareAction` | `{id}`                              | Set token null; return acknowledgement.                                                     |

Authenticate and authorize inside every protected action, validate all input, and rate-limit writes. Treat action arguments as untrusted even when passed from a Server Component. Return serializable results: `{ ok: true, data: ... }` or `{ ok: false, error: { code, message }, requestId?: string }`. Expected codes include `VALIDATION_ERROR`, `UNAUTHENTICATED`, `NOT_FOUND`, `CONFLICT`, `CONTENT_TOO_LARGE`, and `RATE_LIMITED`; unexpected errors use `INTERNAL_ERROR`, a generic message, and a correlation `requestId`. These are action results, not custom HTTP status contracts. Never expose stack traces, SQL, tokens (except an owner's requested share URL), environment variables, internal paths, or raw exception strings. Better Auth's infrastructure routes keep their library-defined contract.

`updateNoteAction` must use **optimistic concurrency control**:

```sql
UPDATE notes SET title = ?, content_json = ?,
  updated_at = ?, revision = revision + 1
WHERE id = ? AND user_id = ? AND revision = ?;
```

Zero updated rows: distinguish absent/not-owned (`NOT_FOUND`) from revision mismatch (`CONFLICT`) on the server without disclosing others' records. Server Component reads use `notFound()` for missing/non-owned notes or invalid/revoked share links. Unauthenticated protected page reads redirect to `/sign-in`; action failures return `UNAUTHENTICATED` so the editor can preserve its draft.

After mutations, use the installed Next.js refresh/revalidation APIs or redirects as appropriate so affected Server Components render current data. Autosave may consume its mutation acknowledgement directly for saved status/revision; this does not introduce a separate client read. Preserve newer local edits during server refreshes. Reloading a server version after a conflict uses route refresh/navigation to re-run the Server Component, with explicit draft-discard confirmation where needed.

Do not cache authenticated or public note content across requests in Next.js, the CDN, or the service worker; revocation must take effect on the next server request. Render note/session pages dynamically. Server-only repository functions are ordinary internal functions, not exported Server Actions for reads.

## 7. Autosave behavior (critical)

1. On **New note**, keep local draft until a nonempty title exists; first autosave invokes `createNoteAction`. Avoid inserting a blank/untitled note and **never duplicate** a creation after delayed responses: one in-flight create at a time.
2. On saved notes, debounce valid changes by **800 ms**. `updateNoteAction` receives the current `revision`; only one save per note in flight. If edits occur while saving, queue the latest draft and send it **after** the response, preserving order.
3. UI states: `Saved`, `Saving…`, `Unsaved changes`, `Offline / Couldn't save — Retry`. Keep draft text in memory on failures, retry with bounded backoff or Retry button; **never claim success without server acknowledgement**.
4. On blur, request immediate save when valid. On navigation/close with unsaved or in-flight changes, show a warning where browser support permits; `beforeunload` is **not** a reliable save mechanism. Do not silently discard unsaved changes.
5. On `CONFLICT`, stop automatic writes, retain local draft, and show clear **Reload server version / Keep my draft** options; do not silently overwrite newer data. On `UNAUTHENTICATED`, preserve the draft in the current view and prompt sign-in; never send another user's draft under a new session.
6. On share/public reads, display **last server-saved** data only. Saving title and content is atomic. Never persist editor state as an HTML string.

## 8. Rendering and security

- Persist only JSON matching a **strict allowlist** of the supported Tiptap/ProseMirror nodes, marks, attributes, and depth/size limits. Reject unexpected embedded HTML, images, scripts, arbitrary URLs, or malformed documents.
- Render public notes from **validated JSON** using a server-compatible Tiptap renderer with the exact permitted extensions; sanitize any emitted HTML before inserting it into the page, and permit only `http:`, `https:`, or appropriately validated relative links. No `javascript:` / `data:` links. Link opens use `rel="noopener noreferrer"` when applicable.
- Enforce server-side input validation, bounded request body sizes, prepared SQL, CSRF protections from Better Auth for auth calls, Next.js Server Action origin checks and appropriate allowed-origin configuration, appropriate security headers, and controlled production logging.
- Share tokens: at least **32 random bytes**, URL-safe encoded, never sequential or derived from note ID. Show full URL only to the owner; **do not log tokens**. Revocation sets `share_token = NULL`; regenerated tokens must differ. Explicitly prevent shared responses from being cached (`Cache-Control: private, no-store` or `no-store` as appropriate; Next dynamic rendering).
- Store password hashes only via Better Auth. Do not log credentials, session cookies, auth headers, full note bodies, or share URLs. TLS in production. SQLite file and environment secrets must not be web-accessible.

## 9. Errors, 404, and observability

Use one server error boundary/handler that maps expected failures to stable error codes/messages and generates a `requestId` for unexpected failures. Server logs may contain request ID, route, operation, failure category, timing, and **sanitized stack**; client sees only `"Something went wrong. Please try again."` for unexpected failures. Never return database driver errors, table names, file paths, Better Auth secrets, stack traces, or sensitive request bodies. Expose generic **404** for unknown routes, invalid share links, deleted notes, and non-owned note URLs; use an accessible `not-found.tsx` with Home / Go to notes actions. Provide `error.tsx` and `global-error.tsx` for render failures, plus inline nonfatal autosave errors.

Handle explicitly: invalid credentials, duplicate email, expired session, no network, invalid JSON/title, body too large, SQLite locked/full, optimistic-save conflict, missing note, revoked link, and unexpected server errors. Test that sanitized action results and rendered error states contain **no** stack trace or SQL text, while internal logs contain the correlation ID.

## 10. PWA and deployment

- Manifest with name **Tiny Notes**, short name, `start_url: /`, `display: standalone`, theme/background colors, and valid **192×192 and 512×512** app icons (including maskable as supported). Include Apple touch icon and appropriate meta tags; use real HTTPS in production.
- Service worker caches **only versioned static app assets/offline shell** if implemented; **never cache** `/api/*`, `/share/*`, `/notes/*` user-specific HTML or auth/session responses. Do not claim offline access to notes. Show lightweight platform-specific Add to Home Screen guidance, especially Safari on iOS.
- `.env.example`: `DATABASE_PATH`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; document local/prod origins and any needed auth trusted origins. Keep `.env*` secrets and database files out of Git.
- Deploy on **persistent disk**, with backups for SQLite database (including WAL-aware procedure); single writer/instance for MVP. Verify filesystem permissions and migration-before-start. Do not deploy on ephemeral/serverless filesystem or Next.js Edge runtime.

## 11. Suggested project layout and scripts

```text
src/app/{page.tsx,not-found.tsx,error.tsx,global-error.tsx}
src/app/(auth)/{sign-in,sign-up}/page.tsx
src/app/notes/{page.tsx,new/page.tsx,[id]/page.tsx}
src/app/share/[token]/page.tsx
src/app/api/auth/[...all]/route.ts
src/app/actions/{auth.ts,notes.ts}
src/components/{editor,notes,theme,pwa}/
src/lib/{auth.ts,db.ts,notes-repository.ts,validation.ts,errors.ts}
scripts/migrate.ts
migrations/{001_auth.sql,002_notes.sql}
public/{icons/,manifest assets}
```

Provide Bun scripts for `dev`, `build`, `start`, `db:migrate`, `test`, `lint`, and `typecheck`; README must include install, env setup, migration, running, tests, and deployment limits. Pin compatible versions of Bun, Next.js, Better Auth, and Tiptap. Ensure Server Components, Server Actions, and the Better Auth handler execute in **Node-compatible/Bun runtime**, not Edge.

## 12. Acceptance tests / definition of done

- No `content_text` column, persisted plain-text derivative, or search index exists; note bodies persist only as validated `content_json`.
- No application query parameters, search/filter UI, client-side filtering, pagination, or selectable sorting; `/notes` shows all owner notes in fixed `updated_at DESC` order.
- All data fetching occurs in Server Components via server-only repository/auth functions; no client fetching, session-fetching hooks, read-only actions, or notes/shared REST endpoints. All server mutations, including auth and debounced autosave, invoke Server Actions.
- Open signup, sign-in, sign-out, session persistence/expiry, and unauthorized page/Server Action behavior work; passwords never stored in plain text.
- Auth tables match pinned Better Auth generated schema; custom migration is idempotent; SQLite foreign keys and app ownership constraints work.
- Users cannot list/read/edit/delete/share another user's note; request attempts produce no private data.
- Tiptap content survives create → autosave → reload; rapid typing, blur, slow responses, network failure/recovery, `CONFLICT` results, and leaving the page never silently report an unsaved draft as saved.
- Autosave creates one note, never duplicates it; no Manual Save button remains.
- Sharing is private by default; enabling exposes public page anonymously; disabling immediately revokes old link; new enable creates a new token; public view is read-only and sanitized.
- Unknown routes, invalid/revoked tokens, deleted/non-owned notes show proper **404**; app render failures show safe error boundaries; Server Actions return useful safe codes without internal details.
- Light/dark and system default work; preference persists without `/settings`. Android/iOS installation flows and mobile keyboard/viewport behavior verified; offline note editing not advertised.
- Security tests cover HTML/script injection, dangerous URLs, oversized payloads, malformed JSON, forbidden ownership, token entropy, and sensitive-data logging. `bun run test`, `lint`, `typecheck`, and production build pass.

## 13. Source of truth / implementation notes

- Better Auth database schema and migrations: https://www.better-auth.com/docs/concepts/database
- Better Auth Bun SQLite adapter: https://www.better-auth.com/docs/adapters/sqlite
- Better Auth Next.js integration: https://www.better-auth.com/docs/integrations/next
- Tiptap documentation: https://tiptap.dev/docs/editor/getting-started/overview
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps

**Deliberate non-goals:** don't add a settings page, manual saving, optional features, external storage, an ORM, or a more complex multi-instance/offline sync architecture unless explicitly approved.
