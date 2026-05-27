# Plan: GitHits-Assisted Codebase Improvement Audit

## Context

The project is at v1.0.1 with all 10 build phases complete. The codebase is clean — strict TypeScript, no TODO markers, consistent patterns — but is now mature enough to benchmark against real-world open-source implementations. GitHits (v0.4.10) is installed via npx and as a Claude Code plugin; it searches public repos for working implementations of specific patterns. The goal is to use it to surface improvements we wouldn't find from static analysis alone.

## Improvement Candidates (ranked by likely return)

Based on reading the code, six areas have patterns worth benchmarking:

### 1. `chrome.storage.local` read-modify-write race conditions
**File:** `apps/browser-extension/src/lib/store/storage.ts`  
**Issue:** `saveSettings()` and `addToRotationHistory()` both do async read → merge → write. Two tabs calling `addToRotationHistory` concurrently will silently lose one write.  
**GitHits query:** `githits example "chrome.storage.local race condition atomic update" --lang ts`  
**Expected finding:** Pattern using `chrome.storage.local.get` + callback inside `set` call, or a mutex/queue, or using `chrome.storage.session` as a lock.

### 2. MV3 service worker keep-alive
**File:** `apps/browser-extension/src/entrypoints/background.ts`  
**Issue:** No keep-alive mechanism. MV3 SWs are killed after ~30s of inactivity. The `activeWait` singleton lives in module scope — it's wiped when the SW restarts mid-wait. A tab that started a wait could lose its `activeWait` record before `wait_end` fires.  
**GitHits query:** `githits example "chrome extension manifest v3 service worker keepalive alarms" --lang ts`  
**Expected finding:** `chrome.alarms.create` heartbeat pattern, or `chrome.storage.session` for transient state.

### 3. MutationObserver scope in detectors
**Files:** `apps/browser-extension/src/entrypoints/content/detectors/*.ts`  
**Issue:** All four detectors observe `document.body` with `{ subtree: true, childList: true, attributes: true }` — this fires on every DOM mutation on the entire page, not just the streaming indicator. On heavy pages (ChatGPT, Gemini), this is a lot of noise.  
**GitHits query:** `githits example "MutationObserver attributeFilter streaming indicator" --lang ts`  
**Expected finding:** Using `attributeFilter: ['aria-label', 'data-status']` to narrow attribute observations; or observing a tighter container when it exists.

### 4. `chrome.runtime.onMessage` async safety
**File:** `apps/browser-extension/src/entrypoints/background.ts:58-90`  
**Issue:** Two `onMessage` listeners are registered for different message types. The second listener (lines 66-90) calls `sendResponse` synchronously then returns `false` — but `handleWaitEvent` is async and runs after the return. This is technically correct but fragile: adding `await` inside later would silently break it. Also, multiple `onMessage` listeners on the same runtime is a known source of "The message port closed" errors.  
**GitHits query:** `githits example "chrome.runtime.onMessage multiple listeners async" --lang ts`  
**Expected finding:** Single listener with a type-switch dispatch; or `chrome.runtime.onMessage.addListener` returning `true` for async listeners.

### 5. Svelte 5 runes + shadow DOM animation patterns
**Files:** `apps/browser-extension/src/entrypoints/content/ui/Panel.svelte` et al.  
**Issue:** Need to verify Panel.svelte's animation implementation — whether `prefers-reduced-motion` is applied at CSS transition level or inline style level, and whether the fade uses Svelte transitions (which don't work well in shadow DOM) or the manual opacity approach from the SKILL.md.  
**GitHits query:** `githits example "Svelte 5 runes shadow DOM fade animation prefers-reduced-motion" --lang svelte`  
**Expected finding:** Confirmation or refinement of the manual opacity pattern; possible `svelte/transition` workarounds for shadow DOM.

### 6. WXT content script bundle analysis
**File:** `apps/browser-extension/wxt.config.ts` (or equivalent)  
**Issue:** The 50KB gzip budget constraint. Need to verify current bundle size post-v1 and whether dynamic import for `WriteOnlyTextarea` was implemented as specified in SKILL.md.  
**GitHits query:** `githits example "WXT browser extension content script code splitting dynamic import" --lang ts`  
**Expected finding:** Pattern for lazy-loading a Svelte component only when a specific activity category is active.

## Execution Plan

Run the six GitHits queries above, evaluate each result against the corresponding code, then implement any confirmed improvements. Prioritize by impact:

1. **Critical** (data loss risk): Race condition in storage (#1) + SW keep-alive (#2)
2. **Performance**: MutationObserver scope (#3)  
3. **Correctness**: onMessage pattern (#4)  
4. **UI quality**: Shadow DOM animation (#5)  
5. **Bundle**: Size audit (#6)

## Verification

After each change:
- `pnpm lint` must pass (Biome)
- `pnpm test` must pass (Vitest, especially `selector.test.ts` and `catalog.schema.test.ts`)
- For storage changes: manual test with two tabs open on claude.ai, skip activity rapidly in both
- For SW changes: inspect background SW devtools → Application → Service Workers, confirm SW survives 30s idle
- For MutationObserver: verify detector still fires correctly on a streaming response
- For bundle: `gzip -c apps/browser-extension/.output/chrome-mv3/content-scripts/content.js | wc -c` must be < 51200
