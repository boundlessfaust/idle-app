import type {
  WaitProvider,
  WaitProviderHandle,
  WaitProviderState,
} from '@idle/core/detection/provider';
import type { WaitEvent } from '@idle/core/detection/types';

// ── Selector notes (as of 2026-05-17) ─────────────────────────────────────────
//
// LIVE INSPECTION LIMITATION:
//   This provider was authored in a headless dev container without a live browser.
//   Selectors below are drawn from gemini.google.com's known DOM patterns as of early 2026.
//   Verify manually on the live site before each release; bump providerVersion on any change.
//
// OBSERVATION CONTAINER: document.body (subtree)
//   Gemini is an Angular app. Response elements live inside a component tree rooted
//   in custom elements like <model-response> and <chat-window>, but the stop button
//   can be rendered via Angular portals outside the response subtree. Observing
//   document.body catches mutations anywhere in the tree.
//
// STREAMING SIGNAL 1 — loading model-response element (preferred; structural)
//   Selector: model-response[class*="loading"]
//   Gemini stamps a CSS class containing "loading" on the <model-response> custom
//   element while the response streams. The class is removed when streaming ends.
//   ⚠️ FRAGILE — Angular class names may change with Gemini UI rebuilds.
//     On break: bump PROVIDER_VERSION, update selector, update LAST_VERIFIED.
//
// STREAMING SIGNAL 2 — stop-generation button (fallback)
//   STOP_SELECTORS covers known variants of the stop button by aria-label.
//   "Stop generating" is the primary English label; "Stop" and "Stop response"
//   are kept as fallbacks. All are i-flagged for locale safety.
//   ⚠️ FRAGILE — aria-label text changes with UI redesigns or localisations.
//     On break: bump PROVIDER_VERSION, update selectors, update LAST_VERIFIED.
//
// DIAGNOSTIC ANCHOR: c-wiz
//   Google's standard Angular shell container. Present on all Gemini pages.
//   Used only for selector-miss diagnostics; the observer always targets document.body.
//
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_KEY = 'web:gemini.google.com';
const PROVIDER_VERSION = '1.0.0';
const LAST_VERIFIED = '2026-05-17';

// Primary signal: loading state on the <model-response> custom element.
const LOADING_RESPONSE_SELECTOR = 'model-response[class*="loading"]';

// Fallback signal: stop-generation button variants.
const STOP_SELECTORS = [
  'button[aria-label="Stop generating" i]',
  'button[aria-label="Stop response" i]',
  'button[aria-label="Stop" i]',
];

// Routes failure logs through the background SW so Dexie stays out of the
// content script bundle (50 KB gzip budget). Background SW writes to Dexie.
function logFailure(errorType: 'selector_miss' | 'observer_error' | 'init_fail', message: string) {
  chrome.runtime
    .sendMessage({
      type: 'LOG_DETECTOR_FAILURE',
      entry: {
        detector: CONTEXT_KEY,
        providerVersion: PROVIDER_VERSION,
        errorType,
        at: Date.now(),
        message,
      },
    })
    .catch(() => {});
}

function isStreaming(): boolean {
  if (document.querySelector(LOADING_RESPONSE_SELECTOR)) return true;
  return STOP_SELECTORS.some((sel) => !!document.querySelector(sel));
}

// Nudges the panel up from the default bottom-right corner to clear Gemini's
// fixed composer input bar (~60px tall + padding). Applied to DEFAULT position
// only — user-saved positions are never overridden by this offset.
export const panelOffset = { x: 0, y: -80 };

export const provider: WaitProvider = {
  contextKey: CONTEXT_KEY,
  providerVersion: PROVIDER_VERSION,
  lastVerified: LAST_VERIFIED,

  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle {
    let _state: WaitProviderState = 'idle';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    function onStreamingStart() {
      // 500ms debounce — if wait_end fires within this window the panel is never shown
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (_state !== 'waiting') {
          _state = 'waiting';
          dispatch({ type: 'wait_start', at: Date.now() });
        }
      }, 500);
    }

    function onStreamingEnd() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        return; // wait_end arrived within debounce window — wait_start was never fired
      }
      if (_state === 'waiting') {
        _state = 'idle';
        dispatch({ type: 'wait_end', at: Date.now() });
      }
    }

    function checkStreamingState() {
      const streaming = isStreaming();
      if (streaming && _state === 'idle') onStreamingStart();
      else if (!streaming && _state === 'waiting') onStreamingEnd();
    }

    function attach() {
      // Log if Google's Angular shell container is absent — useful for detecting
      // major DOM structure regressions. The observer always targets document.body.
      if (!document.querySelector('c-wiz')) {
        logFailure(
          'selector_miss',
          "'c-wiz' not found on gemini.google.com — DOM structure may have changed",
        );
      }

      observer = new MutationObserver(checkStreamingState);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });

      // Immediate check in case streaming is already active when the content script loads
      checkStreamingState();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    } else {
      attach();
    }

    return {
      stop() {
        observer?.disconnect();
        observer = null;
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        _state = 'idle';
      },
      get state() {
        return _state;
      },
    };
  },
};
