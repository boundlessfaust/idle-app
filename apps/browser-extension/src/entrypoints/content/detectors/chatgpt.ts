import type {
  WaitProvider,
  WaitProviderHandle,
  WaitProviderState,
} from '@idle/core/detection/provider';
import type { WaitEvent } from '@idle/core/detection/types';

// ── Selector notes (as of 2026-05-14) ─────────────────────────────────────────
//
// LIVE INSPECTION LIMITATION:
//   This provider was authored in a headless dev container without a live browser.
//   Selectors below are drawn from chatgpt.com's known DOM patterns as of early 2026.
//   Verify manually on the live site before each release; bump providerVersion on any change.
//
// OBSERVATION CONTAINER: document.body (subtree)
//   ChatGPT renders inside a Next.js root (#__next) but the stop button and
//   streaming divs can appear in portal-mounted overlays outside that root.
//   Observing document.body catches mutations anywhere in the tree.
//
// STREAMING SIGNAL 1 — streaming message div (preferred; semantic)
//   Selector: [data-message-author-role="assistant"][data-status="streaming"]
//   ChatGPT stamps data-status="streaming" on the active assistant turn div while
//   the response is being generated. It transitions to "done" (or is removed) when
//   the stream ends. This is the most reliable signal — not affected by button text
//   or aria-label localization.
//
// STREAMING SIGNAL 2 — stop-generation button (fallback)
//   The button that appears in the toolbar while ChatGPT is generating.
//   STOP_SELECTORS covers known variants by data-testid and aria-label.
//   data-testid="stop-button" is preferred; aria-label variants are i-flagged for
//   locale safety.
//   ⚠️ FRAGILE — data-testid values change with Next.js rebuilds; aria-label text
//     changes with UI redesigns or locales.
//     On break: bump PROVIDER_VERSION, update selectors, update LAST_VERIFIED.
//
// DIAGNOSTIC ANCHOR: [role="main"] or #__next
//   Used only for selector-miss diagnostics. The observer targets document.body
//   regardless of whether this anchor element is found.
//
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_KEY = 'web:chatgpt.com';
const PROVIDER_VERSION = '1.0.0';
const LAST_VERIFIED = '2026-05-14';

// Primary signal: streaming status attribute on the assistant message div.
const STREAMING_DIV_SELECTOR = '[data-message-author-role="assistant"][data-status="streaming"]';

// Fallback signal: stop-generation button. data-testid is most stable;
// aria-label variants are kept for older builds and non-English locales.
const STOP_SELECTORS = [
  'button[data-testid="stop-button"]',
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

function isStreaming(): boolean {
  if (document.querySelector(STREAMING_DIV_SELECTOR)) return true;
  return STOP_SELECTORS.some((sel) => !!document.querySelector(sel));
}

// Nudges the panel up from the default bottom-right corner to clear chatgpt.com's
// fixed composer input (~72px tall + padding). Applied to DEFAULT position only;
// the Panel never overrides a user-saved position with this offset.
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
      // Log if the Next.js root is absent — useful for detecting DOM structure regressions.
      // The observer always targets document.body regardless.
      if (!document.querySelector('#__next') && !document.querySelector('[role="main"]')) {
        logFailure(
          'selector_miss',
          "'#__next' and '[role=\"main\"]' not found on chatgpt.com — DOM structure may have changed",
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
