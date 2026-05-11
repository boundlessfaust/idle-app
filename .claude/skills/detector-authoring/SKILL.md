---
name: detector-authoring
description: >
  Use when creating or modifying a WaitProvider for a specific AI site (claude.ai,
  chatgpt.com, gemini.google.com, perplexity.ai) or future platform host (IDE, desktop).
  Covers the WaitProvider contract, contextKey conventions, MutationObserver patterns,
  selector versioning, failure logging, and the 500ms debounce requirement.
compatibility: >
  Claude Code. Requires packages/core/detection/provider.ts to exist.
  Browser providers run in apps/browser-extension/entrypoints/content/detectors/.
---

## When to Use This Skill
Load this skill before:
- Creating a new site-specific provider file
- Modifying selector logic in an existing provider
- Bumping `providerVersion` after a selector break
- Implementing the manual hotkey fallback

## WaitProvider Contract

Every provider implements this interface from `packages/core/detection/provider.ts`:

```typescript
export interface WaitProvider {
  readonly contextKey: string;      // "web:claude.ai" | "ide:vscode:claude" | etc.
  readonly providerVersion: string; // semver — bump on ANY selector change
  readonly lastVerified: string;    // ISO date — update when you verify selectors still work
  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle;
}

export interface WaitProviderHandle {
  stop(): void;
  readonly state: WaitProviderState;
}

export type WaitProviderState = 'idle' | 'waiting' | 'error';
```

NEVER use `DetectorContract` — that type is retired.

## contextKey Conventions
| Platform | Format | Example |
|---|---|---|
| Web (browser extension) | `web:<hostname>` | `web:claude.ai` |
| IDE | `ide:<editor>:<context>` | `ide:vscode:claude`, `ide:cursor:chat` |
| Desktop/OS | `desktop:<os>` | `desktop:macos`, `desktop:windows` |

## Canonical Browser Provider Template

```typescript
// apps/browser-extension/entrypoints/content/detectors/<site>.ts
import type { WaitProvider, WaitProviderHandle, WaitEvent } from '@idle/core/detection/provider';
import { logDetectorFailure } from '../../lib/store/detectorLogs';

export const provider: WaitProvider = {
  contextKey: 'web:<hostname>',
  providerVersion: '1.0.0',
  lastVerified: 'YYYY-MM-DD',

  start(dispatch) {
    let state: 'idle' | 'waiting' | 'error' = 'idle';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    function onStreamingStart() {
      // 500ms debounce — suppress panel if wait_end fires within window
      debounceTimer = setTimeout(() => {
        if (state !== 'waiting') {
          state = 'waiting';
          dispatch({ type: 'wait_start', at: Date.now() });
        }
      }, 500);
    }

    function onStreamingEnd() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        return; // wait_end within debounce window — never fired wait_start
      }
      if (state === 'waiting') {
        state = 'idle';
        dispatch({ type: 'wait_end', at: Date.now() });
      }
    }

    function attach() {
      const container = document.querySelector('<STREAMING_CONTAINER_SELECTOR>');
      if (!container) {
        logDetectorFailure({
          detector: 'web:<hostname>',
          providerVersion: provider.providerVersion,
          errorType: 'selector_miss',
          message: 'Streaming container not found — selector may be stale',
        });
        state = 'error';
        return;
      }

      observer = new MutationObserver(() => {
        const isStreaming = /* site-specific streaming indicator */ false;
        if (isStreaming && state === 'idle') onStreamingStart();
        if (!isStreaming && state === 'waiting') onStreamingEnd();
      });

      observer.observe(container, { subtree: true, childList: true, attributes: true });
    }

    // Retry attach once if initial DOM isn't ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    } else {
      attach();
    }

    return {
      stop() {
        observer?.disconnect();
        if (debounceTimer) clearTimeout(debounceTimer);
        state = 'idle';
      },
      get state() { return state; },
    };
  },
};
```

## Site-Specific Streaming Indicators (verify at build time — these WILL go stale)

| Site | Detection Signal | Notes |
|---|---|---|
| `claude.ai` | Streaming response container without completed-state attribute | Check for `.streaming` class or absence of `data-complete` |
| `chatgpt.com` | "Stop generating" button visibility OR streaming message div | Button selector changes frequently |
| `gemini.google.com` | Loading indicator within response turn | Look inside `.response-container` |
| `perplexity.ai` | Answer-loading state class on answer container | |

**CRITICAL:** Selectors WILL break when sites update their DOM.
- After verifying selectors still work: update `lastVerified` to today's ISO date.
- After changing any selector: bump `providerVersion` (semver patch or minor).
- On selector miss: `logDetectorFailure()` is called automatically in the template above.

## Failure Logging Schema

```typescript
// apps/browser-extension/lib/store/detectorLogs.ts
interface DetectorLog {
  detector: string;          // contextKey
  providerVersion: string;
  errorType: 'selector_miss' | 'observer_error' | 'init_fail';
  at: number;                // epoch ms
  message: string;
}
// Retention: 7 days, 500-entry cap per detector
// User-clearable from Options page → Advanced Settings
```

## Manual Hotkey Fallback

```typescript
// apps/browser-extension/lib/detection/fallback.ts
// Fires wait_start on Ctrl/Cmd+Shift+L; fires wait_end on second press
// Detects hotkey conflict on load:
const commands = await chrome.commands.getAll();
const cmd = commands.find(c => c.name === 'toggle-wait');
if (!cmd?.shortcut) {
  chrome.runtime.sendMessage({ type: 'hotkey_conflict' });
  // Popup and Options page display persistent warning until resolved
}
```

## Site-Specific Panel Offset

Each provider can export an optional `panelOffset` to nudge the default panel position
away from the site's input box:

```typescript
export const panelOffset = { x: 0, y: -80 }; // px; applied to DEFAULT position only
// NEVER override a user-saved position with this offset
```

## Checklist Before Submitting a Provider PR
- [ ] Implements `WaitProvider` interface exactly
- [ ] `contextKey` follows naming convention
- [ ] `providerVersion` is valid semver
- [ ] `lastVerified` is today's date
- [ ] 500ms debounce implemented via `setTimeout` pattern above
- [ ] `logDetectorFailure()` called on selector miss
- [ ] `stop()` tears down observer and clears timers
- [ ] Zero imports from UI code (`entrypoints/content/ui/`)
- [ ] `bun run lint` passes
