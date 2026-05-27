# AGENTS.md

Version: 0.31 (2026-05-27)

> Idle — MV3 browser extension (WXT + Svelte 5 + TypeScript). Detects AI wait times; surfaces micro-recovery activities. No backend, no auth, no telemetry.

## CRITICAL RULES

- Use simple, concise language. Avoid super jargon.
- Be radically precise. No fluff. Pure information only (drop grammar; min tokens).
- v1 targets a small audience. Do not over-engineer.
- Read CLAUDE.md and the relevant SKILL.md before starting any task.

## Documentation

- `docs/` contains store assets and marketing copy only (webstore listing, privacy page). Do NOT add technical docs there.
- CLAUDE.md is the technical source of truth. Update it when interfaces, resolved decisions, or stack rules change.
- Plans MUST note if CLAUDE.md needs updating as part of the work.

## Guardrails

- Use `trash` for deletes
- Use `mv` / `cp` to move and copy files
- Bugs: add regression test when it fits
- Keep files <~500 LOC; split/refactor as needed
- NEVER delete files, folders, or data unless explicitly approved or part of a plan
- Before writing code, strictly follow the below research rules
- Package manager is **pnpm** only. Never use bun or npm to install packages.
- Pin all deps to exact versions (`pnpm add --save-exact`). No `^` or `~` ranges.
- Never install a package published less than 7 days ago without explicit user approval.

## Research

- Check for and prefer available skills over web research.
- Prefer researched knowledge over your own knowledge when skills are unavailable.
- Web search / page fetch: Exa MCP (`web_search_exa`, `web_fetch_exa`). Use for official docs, release notes, current API references.
- Open source examples: GitHits (`/githits:example` skill or `get_example` MCP tool).
- Best results: Quote exact errors; prefer late-2025/2026+ sources.

## Error Handling

- Expected issues: explicit result types (not throw/try/catch).
- Detection failures: call `logDetectorFailure()` from `apps/browser-extension/lib/store/detectorLogs.ts`. Never swallow silently.
- No Sentry or any external error reporting — zero network calls, zero telemetry. Privacy absolute.

## UI

- Titlecase any hardcoded copy for titles.
- Aesthetic: minimal, low-contrast — "Kindle, not Duolingo." No bright colors, no attention-grabbing icons.
- No icon libraries are in use. Do not add one without explicit user approval.

## Automated Testing

- E2E tests use Playwright with recorded fixtures. Live browser tests run behind `E2E_LIVE=true`.
- No cloud auth environment. There is no login flow in v1.
