# Idle — Development Plan for Claude Code (v5)

## Overview

**Idle** is a Chromium browser extension that detects AI response wait times and surfaces research-backed micro-recovery activities. The product is guided by a brain-health philosophy — no gamification, no novel content, no engagement loops.

**Architecture note:** All platform-agnostic logic lives in `packages/core` with zero browser API dependencies. Critically, the detection layer is modelled as a **provider state machine**, not a browser-first detector registry. This abstraction is enforced from Phase 1 to prevent refactoring when IDE and desktop hosts are added.

The state machine is the canonical interface:

```typescript
// packages/core/detection/provider.ts
export interface WaitProvider {
  readonly contextKey: string;        // e.g. "web:claude.ai", "ide:vscode:claude", "desktop:macos"
  readonly providerVersion: string;   // semver
  readonly lastVerified: string;      // ISO date
  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle;
}

export interface WaitProviderHandle {
  stop(): void;
  readonly state: WaitProviderState;
}

export type WaitProviderState = 'idle' | 'waiting' | 'error';
```

Browser DOM detectors, VS Code extension hooks, and OS-level process watchers all implement `WaitProvider`. The registry maps `contextKey` patterns to providers. `hostnames` is a browser-extension convenience field only — `contextKey` is the canonical identifier across all platforms.

---

## Monorepo Structure

```
idle/
├── packages/
│   └── core/                    # Platform-agnostic; zero browser API deps
│       ├── detection/
│       │   ├── provider.ts      # WaitProvider — canonical cross-platform interface
│       │   ├── types.ts         # WaitEvent, WaitState, WaitBand
│       │   └── registry.ts      # contextKey -> WaitProvider factory
│       ├── activities/
│       │   ├── catalog.ts       # 36-item hand-curated seed
│       │   ├── selector.ts      # band mapping + rotation algorithm
│       │   └── categories.ts    # PhysicalReset | ContextPreserving | WriteOnly | Diffuse
│       ├── settings/
│       │   └── schema.ts        # Settings type + defaults; no storage implementation
│       └── research/
│           └── citations.ts     # Research footnotes
├── apps/
│   └── browser-extension/       # WXT + Svelte 5 host
│       ├── entrypoints/
│       │   ├── background.ts
│       │   ├── content/
│       │   │   ├── index.ts
│       │   │   ├── detectors/   # Browser-specific DOM detectors
│       │   │   │   ├── claude.ts
│       │   │   │   ├── chatgpt.ts
│       │   │   │   ├── gemini.ts
│       │   │   │   └── perplexity.ts
│       │   │   └── ui/          # Svelte panel components
│       │   ├── popup/
│       │   └── options/
│       └── lib/
│           └── store/
│               ├── settings.ts  # Dexie persistence adapter
│               └── session.ts   # Current wait state + history
└── tests/
    ├── unit/                    # Vitest — covers packages/core exclusively
    └── e2e/                     # Playwright — covers apps/browser-extension
```


---

## Dev Container Specification

All development happens inside a VS Code Dev Container. The container runs the full toolchain; the host machine provides only a browser (Chrome/Edge/Brave) loaded with the extension from the bind-mounted `dist/` directory.

### How It Works with WXT

WXT's dev server runs **inside** the container. The extension's built output is bind-mounted to the host so Chrome can load it unpacked. The hot-reload WebSocket connects from the extension (host browser) back to the WXT dev server (container) via a forwarded port.

```
Host Machine
├── Chrome  ← loads extension from bind-mounted .output/
│            chrome://extensions → Load unpacked
└── VS Code
    └── Dev Containers: Open Folder in Container...
        └── Container
            ├── WXT dev server   (port 3000, bound 0.0.0.0)
            ├── Vitest           (unit tests — packages/core)
            ├── Playwright       (headless Chromium, fixture-based)
            └── Biome            (lint + format)
```

### File Layout

```
idle/
├── .devcontainer/
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── post-create.sh
├── .vscode/
│   ├── settings.json
│   └── extensions.json
└── ... (monorepo root)
```

### `.devcontainer/Dockerfile`

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# System deps for Playwright headless Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    fonts-liberation xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install pnpm as fallback (WXT may require Node runtime for some tasks)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Global Biome CLI (for pre-commit hooks outside workspace context)
RUN npm install -g @biomejs/biome

WORKDIR /workspaces/idle
```

### `.devcontainer/devcontainer.json`

```jsonc
{
  "name": "Idle — Browser Extension Dev",
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },

  // Forward WXT dev server; extension on host connects back for hot-reload
  "forwardPorts": [3000],
  "portsAttributes": {
    "3000": {
      "label": "WXT Dev Server",
      "onAutoForward": "silent"
    }
  },

  "postCreateCommand": "bash .devcontainer/post-create.sh",

  "mounts": [
    // Persist package caches across container rebuilds
    "source=idle-bun-cache,target=/root/.bun/install/cache,type=volume",
    "source=idle-pnpm-store,target=/root/.local/share/pnpm/store,type=volume"
  ],

  "remoteEnv": {
    // Bind WXT dev server on all interfaces (required for host browser hot-reload)
    "WXT_HOST": "0.0.0.0",
    // Disable WXT auto-opening browser — container has no display
    "WXT_OPEN_BROWSER": "false"
  },

  "customizations": {
    "vscode": {
      "extensions": [
        "biomejs.biome",
        "svelte.svelte-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-vscode.vscode-typescript-next",
        "vitest.explorer",
        "ms-playwright.playwright",
        "ms-azuretools.vscode-docker",
        "ms-vscode-remote.remote-containers",
        "streetsidesoftware.code-spell-checker"
      ],
      "settings": {
        "editor.defaultFormatter": "biomejs.biome",
        "editor.formatOnSave": true,
        "editor.codeActionsOnSave": {
          "source.fixAll.biome": "explicit",
          "source.organizeImports.biome": "explicit"
        },
        "[svelte]": {
          "editor.defaultFormatter": "svelte.svelte-vscode"
        },
        "typescript.tsdk": "node_modules/typescript/lib",
        "typescript.enablePromptUseWorkspaceTsdk": true,
        "vitest.enable": true,
        "vitest.commandLine": "bun run test",
        "playwright.reuseBrowser": false,
        "playwright.showTrace": "on-failure"
      }
    }
  }
}
```

### `.devcontainer/post-create.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "==> Detecting package manager..."
if bun --version &>/dev/null; then
  echo "    Bun $(bun --version) — using Bun"
  bun install
else
  echo "    Bun unavailable — falling back to pnpm"
  pnpm install
fi

echo "==> Installing Playwright headless shell (CI fixtures only)..."
bunx playwright install chromium-headless-shell --with-deps

echo "==> Verifying packages/core has no browser globals..."
if grep -rn "chrome\." packages/core/ 2>/dev/null | grep -v "//"; then
  echo "ERROR: browser globals detected in packages/core"
  exit 1
fi
echo "    Clean."

echo ""
echo "==> Dev container ready."
echo "    Dev server:   bun run dev"
echo "    Load in Chrome: apps/browser-extension/.output/chrome-mv3-dev/"
echo "    Tests:        bun run test"
echo "    Lint:         bun run lint"
```

### WXT Config Additions (`apps/browser-extension/wxt.config.ts`)

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    server: {
      // Reads WXT_HOST from devcontainer.json remoteEnv; falls back to localhost
      host: process.env.WXT_HOST ?? 'localhost',
    },
  }),
  webExt: {
    // Disable auto-open: container has no display; load extension manually in host browser
    disabled: process.env.WXT_OPEN_BROWSER === 'false',
  },
});
```

### Developer Workflow

```bash
# First-time setup
# 1. Clone repo
# 2. VS Code: "Dev Containers: Open Folder in Container..."
# 3. post-create.sh runs automatically

# Daily dev
bun run dev                    # WXT server on 0.0.0.0:3000
# In host Chrome: chrome://extensions → Load unpacked
# → idle/apps/browser-extension/.output/chrome-mv3-dev/

# Tests
bun run test                   # Vitest — packages/core only
bun run test:e2e               # Playwright — recorded fixtures (no network)
E2E_LIVE=true bun run test:e2e # Playwright — live AI sites (gated flag)

# Quality
bun run lint                   # Biome lint
bun run format                 # Biome format
```

### CI (GitHub Actions)

Reuse the same Dockerfile — no separate CI image:

```yaml
# .github/workflows/ci.yml (abbreviated)
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/your-org/idle-devcontainer:latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run lint
      - run: bun run test
      - run: bunx playwright install chromium-headless-shell --with-deps
      - run: bun run test:e2e
      # E2E_LIVE intentionally omitted in CI
```


- Hotkey conflict warning renders in popup when shortcut is unregistered
- `wait_start` 500ms debounce: test-mode synthetic `wait_end` fired at T+300ms suppresses panel render

---

## Resolved Specification Decisions

### 1 — Hotkey Conflict Detection
Use `chrome.commands` API. If the registered shortcut is empty string at runtime (Chrome sets it to `""` when a conflict prevents registration), detect this in background.ts and surface a warning badge + inline alert in the popup: *"Shortcut conflict detected — reassign in chrome://extensions/shortcuts."* Link directly to `chrome://extensions/shortcuts`. Provide a secondary in-app hotkey field in Options so the user can configure an alternative without leaving the extension.

### 2 — Prompt Capture Scope (When Opt-In is ON)
Capture the single most recent user message only. No conversation history. Session-scoped: cleared on `wait_start` of the next prompt.

### 3 — "Mute for 1 Hour" Persistence
Write a Dexie record: `{ muteUntil: Date.now() + 3_600_000 }`. On every `wait_start`, background SW reads `muteUntil` and suppresses the panel if `Date.now() < muteUntil`. Persists across browser restarts. Cleared automatically when the datestamp lapses — no manual clear required. Per-wait "Mute for this wait" is in-memory only (does not write to Dexie).

### 4 — Panel Anchor + Docking
Default: **floating**, viewport bottom-right, `position: fixed`, z-index above host site chrome. On `ResizeObserver` layout change, re-clamp to stay within viewport bounds.

**Free-floating saved position**: drag saves exact `{ x, y }` coordinates to Dexie. No corner snapping on drag-end — position is remembered precisely. A **"Reset position"** button in the panel's drag handle area (visible on hover) resets to the default corner (bottom-right). On viewport resize where saved position would be out of bounds, clamp to nearest valid in-bounds position without overwriting the saved value. On sites with a known persistent sidebar (claude.ai, ChatGPT), apply a site-specific offset from each detector's config object to the default position only — never override a user-saved position.

### 5 — Failure Log Retention
- Flush logs older than **7 days** on extension startup.
- Hard cap: **500 entries** per detector. Evict oldest on overflow.
- User-clearable from the Options page ("Clear detector logs").
- Logs stored in Dexie `detectorLogs` table: `{ detector, selectorVersion, errorType, at, message }`.

### 6 — WriteOnly Buffer Pinning
A **pin icon button** (📌 / Phosphor `PushPin`) in the top-right corner of the WriteOnly textarea. Pinned state persists indefinitely until manually unpinned (Dexie-persisted). Visual affordance: pinned = filled icon + subtle highlight on textarea border. Unpinned = outline icon. Uncleared on `wait_start` if pinned. Cleared only on explicit unpin by user. No expiry.

### 7 — Skip Limit Within a Band (Clarified)
"Skip" cycles through all eligible activities in the current wait band in a random non-repeating order. When all options in the band have been shown in this wait, **loop from the beginning of the band** (re-shuffle). Do not escalate to the next band via Skip — band escalation is time-driven only.

### 8 — Category Weights in Options
**Simple on/off toggles** per category. If a category is disabled, its activities are excluded from the selector entirely. A disabled category that would be the only eligible option for a given band silently falls through to the next eligible category. No sliders, no percentages. Default: all four categories ON.

### 9 — Multi-Tab Wait State
**Singleton state via background SW.** Mirrors the pattern used by support chat widgets — the active wait belongs to the most recently active tab on a given hostname. When a `wait_start` fires on Tab B while Tab A has an active wait, Tab A's panel is silently dismissed (no `wait_end` event needed) and Tab B's panel activates. Rotation history is **global across all supported AI sites** — Claude, ChatGPT, Gemini, and Perplexity share one rotation pool. One Dexie `rotationHistory` table; keyed only by activity ID, not by site.

### 10 — Toolbar Icon Badge
User-configurable in Options. Options:
- **None** (default) — stealth mode
- **Active indicator** — green dot while wait is active
- **Mute indicator** — gray badge when muted

Default is None. Setting persists via Dexie.

### 11 — `wait_start` Debounce
500ms grace period before activating the panel. If `wait_end` fires within the 500ms window, the panel is never rendered. Prevents flash on transient tool calls and streaming retries. Effective user-perceived delay from prompt send to panel appearance: ~2000ms (500ms debounce + 1500ms fade-in delay).

### 12 — Rotation Reset Interval
Time-window based (not browser-session based). Default: **4 hours**. Configurable in Options: 1h / 2h / 4h / 8h / Browser session. On window expiry, rotation history clears and the pool re-shuffles. Stored in Dexie: `{ rotationWindowHours: number, lastResetAt: number }`. Background SW checks `lastResetAt` on each `wait_start` and clears history if expired.

### 13 — Prompt-Capture First-Run Nudge
On the first `ContextPreserving` activity shown when `settings.promptCapture === false`, surface a **one-time inline nudge** at the bottom of the activity card:
*"Want to see your prompt here? Stored locally for this session only — nothing leaves your browser."*
- **"Enable"** button: writes `settings.promptCapture = true` immediately
- **"Dismiss"** button: writes `settings.promptCaptureNudgeDismissed = true`; nudge never shown again
- No modal, no overlay, no interruption — inline only, within the card body
- `promptCaptureNudgeDismissed` persists in Dexie

---

## Phase Structure

Build in strict sequential phases. No kitchen-sink commits. Each phase is a separate PR.

---

## Phase 1 — Monorepo Scaffold

### Goal
Establish the core/apps split with full toolchain, zero features.

### Deliverables
- Monorepo root (`bun workspaces` or `pnpm workspaces` depending on WXT compatibility at build time)
- `packages/core` — TypeScript lib, no browser globals, exports nothing yet
- `apps/browser-extension` — WXT project, Svelte 5, TypeScript strict, Tailwind CSS, Biome, Vitest

### Pre-Code Confirmation Required
Before writing any code:
1. Scaffold with npx wxt@latest init (not bunx), select the svelte-ts template, select bun as package manager when prompted. See WXT issue #707.
2. Confirm WXT's current Bun workspace support; fall back to pnpm if unsupported
3. Propose `tsconfig.json` (strict, moduleResolution: bundler, target: ES2022)
4. Propose `wxt.config.ts` with minimum `manifest.permissions`: `["storage", "tabs", "commands", "scripting"]`
5. Confirm Svelte 5 rune mode works with WXT's Vite pipeline (known occasional incompatibility)

### Success Criteria
- `dev` command launches extension in Chrome without errors
- `test` passes trivial Vitest spec in `packages/core`
- `lint` passes via Biome with no warnings
- `packages/core` imports produce a type error if any browser global (`chrome`, `window`, `document`) is referenced — enforce via `lib` in tsconfig: `["ES2022"]` only

---

## Phase 2 — Detection Contracts + Manual Hotkey + Test-Mode Detector

### Goal
Define the typed detection seam between `core` and platform hosts. Ship one working detector (manual hotkey), one synthetic test detector.

### Core Deliverables (`packages/core/detection/`)
- `types.ts` — `WaitEvent`, `WaitState`, `WaitProviderState` interfaces
- `provider.ts` — `WaitProvider` interface (the canonical cross-platform abstraction; replaces `DetectorContract`)
- `registry.ts` — maps `contextKey` pattern → `WaitProvider` factory (browser-agnostic; DOM providers live in `apps/`)

### Extension Deliverables (`apps/browser-extension/`)
- `entrypoints/background.ts` — SW orchestrating detector events; reads `muteUntil` from Dexie before forwarding events to UI
- `lib/detection/fallback.ts` — `Ctrl/Cmd+Shift+L` manual hotkey; detects conflict via `chrome.commands` and surfaces warning if shortcut is empty string at runtime
- `entrypoints/content/detectors/test-mode.ts` — fires synthetic `wait_start` at T+5s, `wait_end` at T+20s; activated by `TEST_MODE=true` env var only

### Interface Contract

```typescript
// packages/core/detection/provider.ts  ← canonical cross-platform interface

export interface WaitProvider {
  readonly contextKey: string;      // "web:claude.ai" | "ide:vscode:claude" | "desktop:macos"
  readonly providerVersion: string; // semver
  readonly lastVerified: string;    // ISO date
  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle;
}

export interface WaitProviderHandle {
  stop(): void;
  readonly state: WaitProviderState;
}

export type WaitProviderState = 'idle' | 'waiting' | 'error';

// packages/core/detection/types.ts

export type WaitEvent =
  | { type: 'wait_start'; at: number; promptText?: string }
  | { type: 'wait_end'; at: number };

export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long' | 'unknown';

export interface WaitState {
  active: boolean;
  band: WaitBand;
  startedAt: number | null;
  // Platform-specific fields added by host adapter — not in core
}

// Browser extension adapter (apps/browser-extension only):
export interface BrowserWaitState extends WaitState {
  tabId: number | null;
}
```

> **Note for future hosts:** VS Code provider uses `contextKey: "ide:vscode:claude"` and hooks into the extension activation events. Desktop provider uses `contextKey: "desktop:macos"` and polls Accessibility API process state. Both implement `WaitProvider` — no changes to `packages/core`.

### Hotkey Conflict Detection

```typescript
// apps/browser-extension/lib/detection/fallback.ts
const commands = await chrome.commands.getAll();
const cmd = commands.find(c => c.name === 'toggle-wait');
if (!cmd?.shortcut) {
  // Conflict or unregistered — notify popup
  chrome.runtime.sendMessage({ type: 'hotkey_conflict' });
}
```

### Success Criteria
- Hotkey fires `wait_start` / `wait_end` pair (verified via background SW console)
- Test-mode detector fires on schedule under `TEST_MODE=true`
- `packages/core` has zero `chrome.*` / `window` / `document` references (CI enforces via grep)
- `packages/core/detection/provider.ts` exports `WaitProvider` interface; CI fails if browser-specific types leak into core


---

## Phase 3 — Activity Catalog + Selector Logic

### Goal
Full 36-activity catalog + selector with 100% unit test coverage. No UI.

### Core Deliverables (`packages/core/activities/`)
- `categories.ts` — `ActivityCategory` union type
- `catalog.ts` — all 36 hand-curated activities as `Activity[]`
- `selector.ts` — band mapping + non-repeating rotation (N=30 default)

### Activity Interface

```typescript
// packages/core/activities/catalog.ts

export type ActivityCategory = 'PhysicalReset' | 'ContextPreserving' | 'WriteOnly' | 'Diffuse';
export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long';

export interface Activity {
  id: string;
  category: ActivityCategory;
  waitBands: WaitBand[];
  title: string;
  body: string;
  durationHintSec: number;
  requiresInput: false;
  citation?: string;
}
```

### Wait Band → Category Eligibility

| Elapsed | Band | Eligible Categories |
|---|---|---|
| 0–60s | short | PhysicalReset |
| 60s–3m | medium-short | PhysicalReset, ContextPreserving |
| 3m–5m | medium-long | ContextPreserving, WriteOnly |
| 5m+ | long | Diffuse, WriteOnly |
| unknown | — | Start at `short`, escalate per band crossing |

### Rotation Rules
- Within a band: non-repeating random order over all eligible activities
- When the band's pool is exhausted: re-shuffle and loop
- History window: last N=30 activity IDs, **global across all supported sites** (not per-site)
- Time window default: **4 hours** (configurable: 1h / 2h / 4h / 8h / Browser session)
- On window expiry: history clears, pool re-shuffles; `lastResetAt` updated in Dexie
- `rotationWindowHours` and `lastResetAt` stored in Dexie `settings` table
- If a category is disabled in settings, exclude from eligible pool
- If disabled category is the *only* eligible option for a band, fall through to the next eligible category (log a warning)

### Success Criteria
- 100% branch coverage on `selector.ts` via Vitest
- Catalog schema validation test: all required fields present, no duplicate IDs
- TypeScript strict; zero `any`

---

## Phase 4 — Side Panel UI

### Goal
Floating/dockable Svelte panel rendered by content script, driven by test-mode detector.

### Deliverables
- `entrypoints/content/index.ts` — injects shadow DOM host to isolate styles from host site
- `entrypoints/content/ui/Panel.svelte`
- `entrypoints/content/ui/ActivityCard.svelte`
- `entrypoints/content/ui/SkipButton.svelte`
- `entrypoints/content/ui/MuteButton.svelte` — writes `muteUntil` to Dexie on click
- `entrypoints/content/ui/WriteOnlyTextarea.svelte` — shown for WriteOnly activities only; pin button included
- `entrypoints/content/ui/DragHandle.svelte` — free-float drag; saves exact `{ x, y }` to Dexie on `pointerup`; "Reset" button reverts to default corner; clamps on viewport resize without overwriting saved position
- `entrypoints/content/ui/PromptCaptureNudge.svelte` — inline nudge shown once inside a ContextPreserving card when prompt capture is OFF; copy explicitly mentions local-only storage; "Enable" writes setting; "Dismiss" sets `promptCaptureNudgeDismissed = true` permanently

### Panel Behaviour
- Injected into a shadow DOM root to prevent host CSS bleed
- Hidden by default; fades in **1500ms after `wait_start`** — but `wait_start` itself has a 500ms debounce, so effective delay from user sending prompt is ~2000ms
- Panel render suppressed entirely if `wait_end` fires within the 500ms debounce window
- Single activity card; no list, no menu
- "Skip" cycles within same band (re-shuffles on band exhaustion — does not escalate)
- "Mute for this wait" — in-memory flag; no Dexie write
- "Mute for 1 hour" — Dexie write: `{ muteUntil: now + 3_600_000 }`
- Auto-dismisses on `wait_end` with 400ms fade
- Singleton: background SW holds one `ActiveWait` state `{ activityId, band, startedAt, skipHistory }`. On tab switch to same hostname, panel renders same activity from shared state — no re-selection. On new `wait_start` (new prompt), state resets.

### Dock Positions
- Default: viewport bottom-right (`position: fixed`)
- User options: bottom-right, bottom-left, top-right, top-left
- Free drag via `DragHandle`; snaps to nearest corner on `pointerup`
- `ResizeObserver` re-clamps position on viewport resize
- Preferred position stored in Dexie under `settings.panelPosition`

### Aesthetics
- Minimal, low-contrast; tone: Kindle not Duolingo
- Dark mode via `prefers-color-scheme` + host body-class check
- No icons that demand attention; no bright colors
- Bundle: content script < 50KB gzipped

### Accessibility
- Full keyboard access: Tab to Skip, Tab to Mute, Escape to dismiss
- `aria-live="polite"` on panel for screen readers
- `prefers-reduced-motion`: disable fade transitions; use instant show/hide

### Success Criteria
- Panel renders in test-mode with correct fade behaviour
- Drag-to-corner snap works; position survives page reload
- Shadow DOM prevents style bleed on claude.ai, chatgpt.com
- Keyboard dismiss works; screen reader announces activity text

---

## Phase 5 — claude.ai Detector

### Deliverables
- `apps/browser-extension/entrypoints/content/detectors/claude.ts`
- Exports `selectorVersion` (semver string) and `lastVerified` (ISO date)
- `MutationObserver` on chat container; detect streaming state
- Site-specific panel offset config (avoid overlapping input box)
- Failure logged to Dexie `detectorLogs` on selector miss

### Failure Logging Schema

```typescript
interface DetectorLog {
  detector: string;
  selectorVersion: string;
  errorType: 'selector_miss' | 'observer_error' | 'init_fail';
  at: number;       // epoch ms
  message: string;
}
// Retention: 7 days, max 500 entries per detector, user-clearable
```

### Success Criteria
- Panel appears during generation on claude.ai; dismisses on completion
- Failure log entry written when streaming indicator selector is absent

---

## Phase 6 — chatgpt.com Detector

### Deliverables
- `apps/browser-extension/entrypoints/content/detectors/chatgpt.ts`
- Observes "stop generating" button or streaming message div
- Same failure-logging contract as Phase 5

---

## Phase 7 — Popup

### Deliverables
- `entrypoints/popup/Popup.svelte`
- Master on/off toggle (writes `settings.enabled` to Dexie)
- Detection mode: auto / manual-only
- "Mute for 1 hour" button
- Hotkey conflict warning (shown if background SW sent `hotkey_conflict` message)
- Link to `chrome://extensions/shortcuts` when conflict detected
- **Persistent conflict banner** also shown at the top of the Options page until the conflict is resolved (re-checks `chrome.commands` on Options page load; banner auto-dismisses when shortcut is valid again)
- "Next Prompt" slot: shows pinned WriteOnly capture if present

---

## Phase 8 — Options Page

### Deliverables
- `entrypoints/options/Options.svelte`
- **Persistent hotkey conflict banner** at top of page (auto-dismisses when conflict is resolved; re-checked on page load via `chrome.commands`)
- Per-site enable/disable (keyed by hostname)
- Category on/off toggles (all four; default all ON)
- Hotkey customization field
- Detector status table: site, `selectorVersion`, `lastVerified`, failure count (last 7 days)
- Rotation reset interval (select: 1h / 2h / 4h / 8h / Browser session; default 4h)
- *(Rotation window N moved to Advanced settings)*
- Panel position: shows current saved `{ x, y }` coordinates + "Reset to default position" button (same action as the in-panel reset)
- Toolbar badge style (None / Active indicator / Mute indicator)
- Prompt-capture toggle (default OFF; note: captures current message only)
- "Clear detector logs" button
- Export local data as JSON button

#### Advanced Settings (collapsed by default)
- Log retention period (select: 1 day / 3 days / 7 days / 30 days; default 7 days)
- Log entry cap per detector (number input; default 500)
- Rotation window N (number input; default 30) *(moved from main settings to Advanced)*
- Raw Dexie data inspector (read-only JSON view)
- About section + inline research citations (Baird 2012, Mark 2008, Cowan 2010, Henning 1997)

---

## Phase 9 — Gemini + Perplexity Detectors

### Deliverables
- `apps/browser-extension/entrypoints/content/detectors/gemini.ts`
- `apps/browser-extension/entrypoints/content/detectors/perplexity.ts`
- Both follow Phase 5 contract and failure-logging

---

## Phase 10 — Playwright E2E Tests

### Deliverables
- `tests/e2e/` — one spec per detector
- Run against **recorded fixtures** in CI (no live network dependency)
- `E2E_LIVE=true` env flag gates live-site runs
- Covers: `wait_start` fires, panel appears, wait_end dismisses, Skip works, Mute works, drag snap persists

---

## Future Platform Targets (Architectural Constraints)

The `packages/core` package must remain 100% platform-agnostic. Future hosts consume it directly:

| Target | Host | Detection Mechanism |
|---|---|---|
| Browser extension (v1) | WXT + Chromium | `WaitProvider` via DOM `MutationObserver` |
| IDE extension (v5) | VS Code / Cursor extension API | LSP event / command execution hooks |
| Desktop app (v5) | Electron or Tauri | OS-level process/window state events |
| OS service (v3+) | Native daemon | `WaitProvider` via Accessibility API, process polling |

Each host implements `WaitProvider` against its own platform. The activity catalog, selector, settings schema, and rotation logic are shared unchanged across all hosts. When adding IDE support, the `WaitProvider`'s `contextKey` field already handles this — `"ide:vscode:claude"`, `"ide:cursor:chat"`, etc. (e.g., `"vscode:claude-extension"`, `"cursor:chat-panel"`).

---

## Global Quality Bar

| Requirement | Spec |
|---|---|
| TypeScript | Strict mode, zero `any` |
| Core isolation | `packages/core` — zero browser globals; enforced by CI grep |
| Selector coverage | 100% branch coverage on `selector.ts` |
| Bundle size | Content script < 50KB gzipped |
| Accessibility | Keyboard-reachable and dismissable; `aria-live`; respects `prefers-reduced-motion` |
| Privacy | No telemetry; prompt text session-scoped, opt-in, single message only |
| Catalog | 100% hand-curated; no LLM-generated text ever |
| Log retention | 7 days, 500-entry cap per detector, user-clearable |

---

## v1 Hard Exclusions

- Sync, accounts, cloud backend
- Firefox / Safari
- IDE / desktop integration (architecture prepared; not shipped)
- Streaks, scores, history graphs
- LLM-generated activities
- Notifications outside the host page

---

## Resolved Questions (Baked In — v3)

1. **`wait_start` debounce**: 500ms grace period before activating. If `wait_end` fires within 500ms of `wait_start`, cancel without rendering the panel. Prevents flash on transient tool calls and retries.

2. **`wait_end` debounce**: TBD in detector PRs. Flag if streaming stutter causes false `wait_end` during generation.

3. **Rotation session definition**: Time-window based, not browser-session based. Default window: **4 hours**. Configurable in Options (1h / 2h / 4h / 8h / Browser session). On window expiry, rotation history clears and the pool re-shuffles. Stored in Dexie as `{ rotationWindowHours: number, lastResetAt: number }`.

4. **Rapid multi-turn waits**: If `wait_start` fires while a wait is already active, reset the active wait (update `startedAt`, re-evaluate band, keep current panel activity unless band changes). Flag edge cases in detector PRs.

5. **Prompt-capture first-run prompt**: On the first `ContextPreserving` activity that would benefit from prompt text, and when `settings.promptCapture === false`, surface a **one-time inline nudge** inside the activity card: *"Want to see your prompt here? Enable prompt capture in settings."* Nudge copy: *"Want to see your prompt here? Stored locally for this session only — nothing leaves your browser."* "Enable" writes `settings.promptCapture = true`. "Dismiss" sets `settings.promptCaptureNudgeDismissed = true` permanently. No modal, no interruption — inline only, within the card body.

