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

🚧 **Active development — v1 not yet released.**

## Stack

- [WXT](https://wxt.dev) — MV3 extension scaffolding
- Svelte 5 (rune mode) + TypeScript (strict)
- Tailwind CSS · Dexie (IndexedDB) · Biome · Vitest · Playwright

## Monorepo layout

```
idle/
├── packages/core/          # Platform-agnostic logic (zero browser globals)
└── apps/browser-extension/ # WXT + Svelte 5 Chromium extension
```

## Development

Requires VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.

```bash
# 1. Open in dev container
#    VS Code → "Dev Containers: Open Folder in Container..."

# 2. Start dev server (runs inside container)
bun run dev

# 3. Load extension in host Chrome
#    chrome://extensions → Load unpacked
#    → apps/browser-extension/.output/chrome-mv3-dev/

# 4. Run tests
bun run test        # unit (Vitest)
bun run test:e2e    # E2E fixtures (Playwright)
```

> **Scaffolding note:** Use `npx wxt@latest init` (not `bunx`) — see [WXT issue #707](https://github.com/wxt-dev/wxt/issues/707).

## Privacy

All data is stored locally in IndexedDB (Dexie). No telemetry. No accounts.
Prompt capture is opt-in and off by default; captured text never leaves the browser.

## Roadmap

- **v1** — Browser extension (Chromium)
- **v2** — IDE extension (VS Code / Cursor)
- **v3** — Desktop / OS service

## License

TBD
