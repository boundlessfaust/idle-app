import type {
  WaitProvider,
  WaitProviderHandle,
  WaitProviderState,
} from '@idle/core/detection/provider';
import type { WaitEvent } from '@idle/core/detection/types';

// ── Selector notes (as of 2026-05-13) ─────────────────────────────────────────
//
// OBSERVATION CONTAINER: document.body (subtree)
//   Claude's stop button lives in a fixed input toolbar that may be outside
//   <main>. Observing document.body ensures we catch mutations anywhere.
//   <main> absence is still logged as selector_miss for diagnostic purposes.
//
// STREAMING INDICATOR: stop-generation button (aria-label based)
//   The button that appears in the action bar while Claude is generating.
//   STOP_SELECTORS covers known English aria-label variants; checked with
//   Array.some() so adding new variants requires no selector format change.
//   ⚠️ FRAGILE — aria-label text may change with UI redesigns or locales.
//     On break: bump PROVIDER_VERSION, update STOP_SELECTORS, update LAST_VERIFIED.
//
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_KEY = 'web:claude.ai';
const PROVIDER_VERSION = '1.0.1';
const LAST_VERIFIED = '2026-05-13';

// Case-insensitive (`i` flag) — claude.ai has used both "Stop response" and
// "Stop Response" across versions. "Stop" alone is kept as a broad fallback.
const STOP_SELECTORS = [
  'button[aria-label="Stop Response" i]',
  'button[aria-label="Stop generating" i]',
  'button[aria-label="Stop streaming" i]',
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

// Nudges the panel up from the default bottom-right corner to clear claude.ai's
// fixed input box (~60px tall + padding). Applied to DEFAULT position only;
// the Panel never overrides a user-saved corner with this offset.
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
      const streaming = STOP_SELECTORS.some((sel) => !!document.querySelector(sel));
      if (streaming && _state === 'idle') onStreamingStart();
      else if (!streaming && _state === 'waiting') onStreamingEnd();
    }

    function attach() {
      // Log if <main> is absent — useful for detecting DOM structure regressions.
      // We always observe document.body so the stop button is caught regardless of
      // whether it renders inside or outside <main>.
      if (!document.querySelector('main')) {
        logFailure(
          'selector_miss',
          "'<main>' element not found on claude.ai — DOM structure may have changed",
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
