# Idle

> A brain-health companion for AI wait times.

Idle is a Chromium browser extension that detects when you are waiting for an AI
response (Claude, ChatGPT, Gemini, Perplexity) and surfaces a single, research-backed
micro-recovery activity matched to how long the wait is likely to last.

**Philosophy:** Preserve cognitive flow and physical health during AI wait times.
No gamification. No novel content. No streaks, scores, or feeds. Every suggestion
is droppable instantly with zero loss.

## Research basis

Activities draw from four categories grounded in published research:

| Category | Research basis |
|---|---|
| Physical resets | Henning et al. 1997 — microbreak recovery |
| Context-preserving review | Mark et al. 2008 — attention residue |
| Write-only capture | Cowan 2010 — working memory offloading |
| Diffuse thinking | Baird et al. 2012 — mind-wandering and insight |

## Status

Feature-complete for v1. All 10 build phases shipped:

| Phase | Deliverable |
|---|---|
| 1 | Monorepo scaffold (WXT, Svelte 5, TypeScript, Tailwind, Biome, Vitest) |
| 2 | Detection contracts, manual hotkey, test-mode provider |
| 3 | Activity catalog (36 hand-curated activities) + selector logic |
| 4 | Side panel UI (shadow DOM injection, drag, mute, skip) |
| 5 | claude.ai wait provider |
| 6 | chatgpt.com wait provider |
| 7 | Popup (master toggle, mute, detection mode, pinned note) |
| 8 | Options page (per-site toggles, advanced settings) |
| 9 | Gemini and Perplexity wait providers |
| 10 | Playwright E2E test suite (32 tests, fixture-based, CI-ready) |

## Stack

- [WXT](https://wxt.dev) — MV3 extension scaffolding
- Svelte 5 (rune mode) + TypeScript (strict)
- Tailwind CSS · Dexie (IndexedDB) · Biome · Vitest · Playwright
- pnpm workspaces

## Monorepo layout

```
idle/
├── packages/core/                  # Platform-agnostic (zero browser globals)
│   ├── detection/                  # WaitProvider interface + registry
│   ├── activities/                 # 36-item catalog + selector logic
│   ├── settings/                   # Schema + defaults
│   └── research/                   # Citation keys
└── apps/browser-extension/         # WXT + Svelte 5 Chromium extension
    ├── src/entrypoints/
    │   ├── background.ts           # Service worker
    │   ├── content/                # Content script + wait providers
    │   ├── popup/                  # Popup UI
    │   └── options/                # Options page
    └── tests/e2e/                  # Playwright fixtures + specs
```

## Development

Requires an IDE or editor with [Dev Containers](https://containers.dev) support — VS Code +
[Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers),
JetBrains Gateway, Cursor, or the [`devcontainer` CLI](https://github.com/devcontainers/cli).

```bash
# 1. Open in dev container
#    VS Code:           "Dev Containers: Open Folder in Container..."
#    JetBrains Gateway: open folder → select "Dev Container"
#    CLI:               devcontainer up --workspace-folder .

# 2. Start dev server (runs inside container, HMR enabled)
pnpm dev

# 3. Load extension in host Chrome
#    chrome://extensions → Load unpacked
#    → apps/browser-extension/.output/chrome-mv3-dev/
```

VS Code users: `.vscode/extensions.json` recommends extensions for Biome, Svelte, Tailwind,
Vitest, and Playwright.

## Testing

```bash
# Unit tests (Vitest — packages/core)
pnpm test

# E2E tests (Playwright — fixture-based, no live network)
pnpm build && pnpm test:e2e

# E2E against live sites (requires signed-in browser session)
pnpm build && E2E_LIVE=true pnpm test:e2e

# Lint
pnpm lint
```

The E2E suite covers 32 scenarios across all four supported sites: panel debounce timing,
wait-end dismissal, Skip cycling, Mute controls, keyboard dismiss, master toggle, and
shadow DOM isolation.

## Privacy

All data is stored locally in IndexedDB (Dexie). No telemetry. No accounts.
Prompt capture is opt-in and off by default; captured text never leaves the browser.

## Roadmap

- **v1** — Browser extension (Chromium) ✓
- **v2** — IDE extension (VS Code / Cursor)
- **v3** — Desktop / OS service

## License

TBD
