# Repository Guidelines

## General Instructions

- Always run `bun run lint` after making changes and fix any linting errors.
- Always check for type errors with `bun tsc --noEmit` and fix any errors.
- After completing all file edits for a task, always run `bun run format` as the final formatting step.

## Project Structure & Module Organization

Tiny Notes currently contains a Next.js App Router scaffold using React, TypeScript, Tailwind CSS, and Bun. Read `SPEC.md` before implementing features; it defines the MVP and its acceptance criteria.

- `app/`: routes, layouts, global styles, and error boundaries. `(auth)/` groups sign-in/sign-up; `notes/` contains list, new, and `[id]` routes; `share/[token]/` contains public sharing.
- `src/components/`: reusable UI, currently page and error placeholders.
- `src/constants/`: shared text constants.
- `public/`: static assets.

Keep routes in the existing root `app/` directory. The spec's suggested `src/app/` layout is not the current structure. Authentication, database modules, migrations, and tests are not implemented yet.

## Build, Test, and Development Commands

Use Bun, as declared in `package.json`, and preserve `bun.lock`.

- `bun install`: install dependencies.
- `bun run dev`: start local development at `http://localhost:3000`.
- `bun run build`: create the production build.
- `bun run start`: serve the production build.
- `bun run lint`: run Oxlint followed by ESLint with Next.js Core Web Vitals and TypeScript rules.
- `bun run format`: format the repository with Oxfmt.
- `bun run format:check`: check formatting without modifying files.
- `bun tsc --noEmit`: check TypeScript with the current configuration.

## Coding Style & Naming Conventions

Follow existing code: two-space indentation, double quotes, semicolons, and strict TypeScript. Use PascalCase component names, camelCase functions/variables, and kebab-case component filenames, such as `page-placeholder.tsx`. Keep Next.js route filenames conventional (`page.tsx`, `layout.tsx`). The `@/*` alias resolves from the repository root; shared imports use `@/src/...`. Prefer Server Components; add `"use client"` where client behavior requires it. Use Oxfmt for formatting; generated output and versioned SQL migrations are excluded.

## Commit & Pull Request Guidelines

Recent commits use `chore:` subjects. Continue with concise, imperative, type-prefixed messages, such as `feat: add note editor`. Keep changes focused. PRs should describe behavior, reference applicable issues or spec sections, list validation performed, and include screenshots for visible UI changes.

## Security & Architecture

Follow the spec's Server Component reads, Server Action mutations, and parameterized SQLite queries. Keep secrets, note content, and database files out of Git. Do not expand the MVP with search, manual saving, or offline editing without an explicit scope change.
