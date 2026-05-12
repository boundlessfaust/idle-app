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
- No telemetry. No network calls. All data stays in Dexie (local).
- Prompt text: session-scoped only, opt-in OFF by default, single most-recent message only.
- NEVER store prompt text across sessions.

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
export type WaitEvent =
  | { type: 'wait_start'; at: number; promptText?: string }
  | { type: 'wait_end'; at: number };
export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long' | 'unknown';
```

## Dexie Tables (browser-extension only)
| Table | Key fields | Notes |
|---|---|---|
| `settings` | singleton | All user preferences |
| `session` | `tabId`, `hostname` | Current wait state per tab |
| `rotationHistory` | `activityId` | Global; reset on `lastResetAt` expiry |
| `detectorLogs` | `detector`, `at` | 7-day TTL, 500-entry cap per detector |
| `panelPosition` | singleton | `{ x, y }` float position |
| `pinnedNote` | singleton | WriteOnly textarea buffer if pinned |

## Wait Band → Activity Mapping
| Elapsed | Band | Eligible Categories |
|---|---|---|
| 0–60s | short | PhysicalReset |
| 60s–3m | medium-short | PhysicalReset, ContextPreserving |
| 3m–5m | medium-long | ContextPreserving, WriteOnly |
| 5m+ | long | Diffuse, WriteOnly |
| unknown | — | Start at `short`, escalate per band crossing |

## Resolved Decisions (do not re-debate these)
- **Rotation:** Global pool across all sites. Resets on time-window expiry (default 4h, configurable).
- **Mute 1hr:** Dexie `{ muteUntil: epoch }`. Checked on every `wait_start`.
- **Panel:** Free-floating `position: fixed`. Drag saves `{x,y}` to Dexie. "Reset" button in handle.
- **Tab switching:** Singleton `ActiveWait` in background SW. Same hostname → same activity card preserved.
- **wait_start debounce:** 500ms. Panel suppressed if `wait_end` fires within window.
- **Rotation session:** Time-window based (not browser session). Default 4h.
- **Hotkey conflict:** Detect via `chrome.commands.getAll()`; warn in popup + persistent Options banner.
- **Prompt capture nudge:** One-time inline nudge with explicit privacy copy: "Stored locally for this session only — nothing leaves your browser."
- **Category weights:** On/off toggles only. No sliders.
- **Pinned note:** Manual clear only. No expiry.
- **Log retention:** 7 days / 500 entries. Configurable in Advanced Settings.

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