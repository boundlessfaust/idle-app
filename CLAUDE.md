# Idle — Claude Code Project Memory

## Project Overview
Browser extension (Chromium, MV3) that detects AI response wait times and surfaces
research-backed micro-recovery activities. Brain health, not engagement. No gamification.

**Mission:** Preserve user flow and cognitive health during AI wait times.
**Audience v1:** Knowledge workers using web-based AI chat (claude.ai, ChatGPT, Gemini, Perplexity).
**Future hosts:** VS Code/Cursor extension, desktop app, OS service — architecture must support all.

## Monorepo Structure
```
idle/
├── packages/core/          # Platform-agnostic. ZERO browser globals ever.
│   ├── detection/          # WaitProvider interface, types, registry
│   ├── activities/         # Catalog (36 items), selector, categories
│   ├── settings/           # Schema + defaults (no storage impl)
│   └── research/           # Citation keys
└── apps/browser-extension/ # WXT + Svelte 5 host
    ├── entrypoints/        # background.ts, content/, popup/, options/
    └── lib/store/          # Dexie persistence adapters
```

## Stack
- **WXT** — MV3 extension scaffolding
- **Svelte 5** — UI (rune mode)
- **TypeScript** — strict mode, zero `any`
- **Tailwind CSS** — styling
- **Dexie** — IndexedDB wrapper (local state only)
- **Vitest** — unit tests
- **Playwright** — E2E (recorded fixtures in CI; live behind `E2E_LIVE=true`)
- **Biome** — lint + format (sole tool; no ESLint, no Prettier)
- **pnpm** — package manager (Bun was incompatible with WXT scaffold; pnpm is the confirmed runtime for this project)

DO NOT ADD: React, Next.js, analytics SDK, auth provider, backend, extra state libs.

## Absolute Rules

### Core isolation (most important)
- `packages/core` MUST have zero references to `chrome`, `window`, `document`, or any browser global.
- Enforce at build time via `tsconfig.json` `"lib": ["ES2022"]` — no DOM lib.
- CI grep check: `grep -rn "chrome\." packages/core/` must return empty.
- The canonical detection interface is `WaitProvider` in `packages/core/detection/provider.ts`.
  NEVER use `DetectorContract` — that name is retired.

### TypeScript
- Strict mode everywhere. Zero `any`. No type assertions (`as X`) unless unavoidable with comment.
- `moduleResolution: bundler`, `target: ES2022`.

### Activity catalog
- NEVER generate activity text with an LLM. All 36 activities are hand-curated.
- Adding an activity requires: `id`, `category`, `waitBands`, `title`, `body`, `durationHintSec`,
  `requiresInput: false`, and `citation` where research exists.
- See `.claude/skills/activity-catalog/SKILL.md` before modifying `packages/core/activities/`.

### Detection / WaitProvider
- Each provider implements `WaitProvider` from `packages/core/detection/provider.ts`.
- `contextKey` format: `"web:<hostname>"` | `"ide:<editor>:<context>"` | `"desktop:<os>"`
- DOM selectors WILL break. Every provider exports `providerVersion` (semver) and
  `lastVerified` (ISO date). Bump `providerVersion` on any selector change.
- See `.claude/skills/detector-authoring/SKILL.md` before writing or modifying a provider.

### UI panel
- Injected into a **shadow DOM root** — never directly into host page DOM.
- Content script bundle MUST stay under 50KB gzipped. Check after every phase.
- Aesthetic: minimal, low-contrast. Kindle, not Duolingo. No bright colors, no attention icons.
- See `.claude/skills/svelte-panel/SKILL.md` before modifying panel components.

### Privacy
- No telemetry. No network calls. All data stored locally (chrome.storage.local + Dexie).
- Prompt capture is NOT implemented in v1. Do not add it without updating the CWS Data Usage
  disclosure (Personal communications checkbox) and privacy policy first.

### Formatting & lint
- Biome owns all JS/TS/JSON formatting. Do not add Prettier or ESLint configs.
- Run `pnpm lint` before marking any task complete.

## Key Interfaces (do not change signatures without updating all implementors)

```typescript
// packages/core/detection/provider.ts
export interface WaitProvider {
  readonly contextKey: string;
  readonly providerVersion: string;
  readonly lastVerified: string;
  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle;
}
export interface WaitProviderHandle { stop(): void; readonly state: WaitProviderState; }
export type WaitProviderState = 'idle' | 'waiting' | 'error';

// packages/core/detection/types.ts
export type WaitEvent = { type: 'wait_start'; at: number } | { type: 'wait_end'; at: number };
export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long' | 'unknown';
```

## Local Storage (browser-extension only)

**chrome.storage.local** — `lib/store/storage.ts` — used by content scripts, background SW, popup, options
| Key | Type | Notes |
|---|---|---|
| `settings` | `Settings` object | enabled, muteUntil, rotationWindowHours, lastResetAt, windowN, disabledCategories, siteEnabled |
| `rotationHistory` | `string[]` | Global activity ID history; auto-reset on window expiry |
| `panelCorner` | `Corner` | `'bottom-right'` \| `'bottom-left'` \| `'top-right'` \| `'top-left'` |
| `pinnedNote` | `string` | WriteOnly textarea buffer; manual clear only |

**Dexie IndexedDB** — `lib/store/db.ts` — background SW only
| Table | Key fields | Notes |
|---|---|---|
| `detectorLogs` | `detector`, `at` | 7-day TTL, 500-entry cap; hardcoded in detectorLogs.ts |

## Wait Band → Activity Mapping
| Elapsed | Band | Eligible Categories |
|---|---|---|
| 0–60s | short | PhysicalReset |
| 60s–3m | medium-short | PhysicalReset, ContextPreserving |
| 3m–5m | medium-long | ContextPreserving, WriteOnly |
| 5m+ | long | Diffuse, WriteOnly |
| unknown | — | Start at `short`, escalate per band crossing |

## Resolved Decisions (do not re-debate these)
- **Rotation:** Global pool across all sites. Resets on time-window expiry (default 4h, configurable). `rotationWindowHours=0` disables auto-reset.
- **Mute 1hr:** `muteUntil` epoch in chrome.storage.local. Checked in background SW and Panel on every `wait_start`.
- **Panel:** Free-floating `position: fixed`. Corner saved to chrome.storage.local. "Reset" button in drag handle.
- **Tab switching:** Singleton `ActiveWait` in background SW. Same hostname → same activity card preserved.
- **wait_start debounce:** 500ms. Panel suppressed if `wait_end` fires within window.
- **Band escalation:** Panel schedules timers from `waitStartedAt` for each threshold crossing (60s/3m/5m) via `msUntilNextBand` in core. On crossing: band updates; current activity is kept if still eligible for the new band, otherwise quietly swapped from the new band pool. Skip cycles within the current (escalated) band; Skip itself never escalates.
- **Rotation session:** Time-window based (not browser session). Default 4h. Implemented in Panel.svelte `handleWaitStart`.
- **Hotkey conflict:** Detect via `chrome.commands.getAll()`; warn in popup + persistent Options banner.
- **Category weights:** On/off toggles only. No sliders.
- **Pinned note:** Manual clear only. No expiry.
- **Log retention:** 7 days / 500 entries. Hardcoded constants in `detectorLogs.ts` — not user-configurable.

## Build Order (phases — complete in sequence, separate PRs)
1. Monorepo scaffold (WXT, Svelte 5, TS, Tailwind, Biome, Vitest)
2. Detection contracts + manual hotkey + test-mode provider
3. Activity catalog + selector logic (100% unit test coverage before any UI)
4. Side panel UI (against test-mode provider)
5. claude.ai provider
6. chatgpt.com provider
7. Popup
8. Options page
9. gemini + perplexity providers
10. Playwright E2E tests

## v1 Hard Exclusions
Firefox/Safari, sync/accounts/cloud, IDE/desktop integration (arch ready; not shipped),
streaks/scores/history graphs, LLM-generated activities, notifications outside host page.

## Dev Container
All development inside `.devcontainer/`. WXT dev server runs in container on `0.0.0.0:3000`.
Extension loaded unpacked in host Chrome from `apps/browser-extension/.output/chrome-mv3-dev/`.
See `.devcontainer/devcontainer.json` and `.devcontainer/post-create.sh`.

## @import References
@.claude/skills/detector-authoring/SKILL.md
@.claude/skills/activity-catalog/SKILL.md
@.claude/skills/svelte-panel/SKILL.md

## Supply Chain Security

### pnpm Minimum Release Age (mandatory — configured in pnpm-workspace.yaml)
All package installs enforce a minimum release age to protect against zero-day supply chain
attacks (e.g. TanStack/Mini Shai-Hulud worm, May 2026 — 42 packages compromised in 6 minutes).

```yaml
# pnpm-workspace.yaml — this block MUST exist
pnpm:
  minimumReleaseAge: 10080   # 7 days in minutes
  minimumReleaseAgeExclude:  # emergency security patches only — document reason in PR
    []
```

**Never remove or reduce `minimumReleaseAge` without explicit user approval.**
If a legitimate dependency install is blocked, add it to `minimumReleaseAgeExclude` with
a comment explaining why, and remove the exclusion once the package ages out.

### Dependency Rules
- **Pin all dependencies to exact versions** in `package.json` — no `^` or `~` ranges.
  Use `pnpm add --save-exact <pkg>` for every install.
- **Verify lockfile integrity** before every `pnpm install`: `pnpm install --frozen-lockfile`
- **No exotic subdependencies** — pnpm 11 blocks these by default; do not override.
- **Never install a package published less than 7 days ago** without explicit user approval
  and a documented reason in the PR.

### Indicators of Compromise (IoCs) — check if any install behaves unexpectedly
- `router_init.js` present anywhere in `node_modules/`
- `@tanstack/setup` in any `optionalDependencies`
- Unexpected `codeql_analysis.yml` files in `.github/workflows/`
- Network traffic to `getsession.org` domains during build

If any IoC is found: stop immediately, do not run further installs, alert the user.

### New Dependency Checklist
Before adding any new dependency, confirm:
- [ ] Package is older than 7 days (enforced by pnpm, but verify manually for critical deps)
- [ ] Publisher is the expected maintainer (check npm registry, not just package name)
- [ ] No suspicious `optionalDependencies` pointing to GitHub commit hashes
- [ ] Package has meaningful download history (not newly created)
- [ ] Confirm with user before adding any package not already in the approved stack

### Approved Stack (no new packages without user approval)
WXT, Svelte 5, TypeScript, Tailwind CSS, Dexie, Vitest, Playwright, Biome, pnpm.
Type packages (`@types/*`) are permitted without approval.

## Agent Behavior Rules

### Prevent mid-task stalls
- Complete one file edit fully before moving to the next. Never leave a file partially edited.
- If a file exceeds 200 lines, split the edit into clearly named sections and complete each
  before moving on. Do not stop between sections.
- When editing a Svelte component, write the complete file in one Edit operation.
  Never break a single component across multiple Edit calls.

### Scope discipline
- Each phase prompt defines exactly what to build. Do not add, refactor, or "improve"
  anything outside the defined deliverables for that phase.
- If something outside scope looks broken, note it in a comment: `// TODO Phase N: fix X`
  and continue. Do not fix it now.

### Context hygiene
- At the start of each phase: read CLAUDE.md and the relevant SKILL.md only.
  Do not re-read files from previous phases unless explicitly needed.
- If context feels long, run `git status` to reorient — do not re-read source files.