---
name: code-review
description: Perform evidence-based code reviews of changes or entire codebases for bugs, security vulnerabilities, and performance problems. Use for requests to carefully review a codebase, analyze security or performance issues, or perform an in-depth review. Does not implement fixes unless requested.
---

# Code Review

Find actionable defects that affect behavior, data, security, or performance. Match the review to the user's requested scope and emphasize the requested concerns.

## Establish coverage

- Read repository instructions, product requirements, architecture notes, and dependency manifests before judging behavior. Distinguish implemented features from documented future work.
- For an entire-codebase review, inventory first-party source, routes, shared modules, configuration, migrations, scripts, and tests. Review each relevant area, including files outside a proposed diff. Exclude generated output, vendor code, and dependency directories from line-by-line review.
- For a change review, inspect the diff plus affected callers, dependencies, and tests. Distinguish regressions introduced by the change from existing defects.
- Trace important flows end to end: entry point, validation, authorization, state changes, persistence, response, and error handling. Follow shared helpers rather than inferring their behavior from names.
- Track coverage during the review. If time or access prevents full coverage, identify the unreviewed areas; do not claim an exhaustive review after sampling files.

## What to examine

### Correctness and reliability

- Compare actual behavior with requirements and public contracts. Check boundary values, nullability, malformed input, serialization, and date or numeric conversions.
- Examine asynchronous ordering, races, stale state, retries, idempotency, and partial failures. Look for lost updates, duplicate operations, and misleading success states.
- Check database constraints, transactions, migrations, ownership predicates, and connection or resource cleanup against real usage.
- Follow error paths and recovery: failed requests, unavailable services, expired sessions, missing records, and interrupted operations. Verify that failures preserve data and reach usable UI or API responses.
- For UI code, examine form behavior, keyboard access, focus, responsive layout, and server/client rendering boundaries where these cause observable defects.

### Security

- Identify trust boundaries and externally reachable inputs. Verify authentication and resource authorization at the server operation that reads or mutates protected data.
- Check injection risks in SQL, HTML, commands, paths, and URLs; unsafe deserialization; and unvalidated redirects or outbound requests where applicable.
- Examine cookies, session lifecycle, CSRF defenses, public sharing, cache isolation, secret handling, and sensitive information in responses or logs.
- Check abuse controls and input limits where expensive or sensitive operations are exposed. Verify dependency or platform security claims against the installed version and authoritative documentation or advisories.
- Describe a plausible attack path and affected asset before reporting a vulnerability. Do not print real credentials, session tokens, private content, or working exploit payloads against live systems.

### Performance

- Trace hot paths and how work grows with input size. Check repeated queries, N+1 access, missing indexes for actual query patterns, unbounded processing, and unnecessary repeated computation.
- Examine blocking work, memory retention, resource leaks, oversized payloads, and avoidable client rendering or bundle costs where relevant.
- Evaluate caching against freshness and authorization requirements; do not recommend caching private data without accounting for isolation and invalidation.
- Ground performance findings in measurements, query plans, or a concrete scaling argument. Treat unmeasured micro-optimizations as optional observations, not defects.

## Verify findings

- Confirm each candidate in the implementation and its callers. Search for guards, configuration, framework behavior, and tests that could invalidate it.
- Use focused tests, static checks, or safe local reproductions when they improve confidence. Read scripts before executing them; avoid production access, database writes, destructive tests, or external side effects without task authorization.
- Use current authoritative documentation when a finding depends on framework or library semantics. Do not assume an unfamiliar API is incorrect.
- Report missing test coverage as a limitation unless it exposes a concrete requirement violation. Passing checks are evidence, not proof of correctness.
- Omit speculative issues, preference-only refactors, intentional behavior, and generic best-practice advice without a demonstrated consequence. Keep material uncertainty explicit and separate open questions from confirmed findings.
- Do not edit source or implement fixes during a review unless requested. Reuse existing reproduction facilities when possible rather than adding files merely to support a review.

## Report findings

Lead with findings, ordered by severity. Consolidate duplicate symptoms of the same root cause.

For each finding, provide:

- A short imperative title with priority: P0 for a confirmed release-blocking emergency, P1 for high-impact failures needing prompt attention, P2 for ordinary actionable defects, or P3 for low-impact defects.
- A precise file and minimal line range locating the defect, with a clickable link or the review surface's native inline comment when available.
- The triggering condition, observed or demonstrably expected failure, impact, and relevant evidence. Include a concise fix direction when useful without prescribing an unnecessary redesign.

Choose severity from impact and realistic reachability; state conditional assumptions. For codebase reviews, label existing issues accurately instead of implying every finding is a new regression.

After findings, briefly state coverage, checks performed and their results, and material limitations or open questions. If no actionable defects are found, say so explicitly without claiming the code is bug-free. Keep optional improvement suggestions separate and include them only when requested or directly useful.
