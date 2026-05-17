import type { WaitEvent } from '@idle/core/detection/types';
import { mount, unmount } from 'svelte';
import Panel from './ui/Panel.svelte';

// Site-specific panel offsets: nudge panel away from fixed input boxes.
// Applied to default corner positions only — user-saved corners are never overridden.
const SITE_OFFSETS: Record<string, { x: number; y: number }> = {
  'claude.ai': { x: 0, y: -80 },
  'chatgpt.com': { x: 0, y: -80 },
  'gemini.google.com': { x: 0, y: -80 },
  'perplexity.ai': { x: 0, y: -80 },
  'www.perplexity.ai': { x: 0, y: -80 },
};

// Typed handle for calling Panel's exported methods
interface PanelHandle {
  handleWaitStart: (at: number, prompt?: string) => void;
  handleWaitEnd: () => void;
}

interface ExtensionMessage {
  type: string;
  event?: WaitEvent;
}

// Pending events buffered until Panel mounts
const pendingEvents: ExtensionMessage[] = [];
let panelHandle: PanelHandle | null = null;

function dispatchToPanel(msg: ExtensionMessage) {
  if (!msg.event) return;
  if (panelHandle === null) {
    pendingEvents.push(msg);
    return;
  }
  if (msg.event.type === 'wait_start') {
    panelHandle.handleWaitStart(msg.event.at, msg.event.promptText);
  } else if (msg.event.type === 'wait_end') {
    panelHandle.handleWaitEnd();
  }
}

export default defineContentScript({
  matches: [
    '*://claude.ai/*',
    '*://chatgpt.com/*',
    '*://gemini.google.com/*',
    '*://perplexity.ai/*',
    '*://www.perplexity.ai/*',
    // E2E fixture tests serve HTML at localhost; data-idle-site on <body> tells
    // us which provider to start. Safe to leave in production — no AI site DOM
    // will be found on localhost so the provider exits silently.
    '*://localhost/*',
    '*://127.0.0.1/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const rawHostname = window.location.hostname;
    // When running E2E fixture tests the page is served from localhost.
    // The fixture sets <body data-idle-site="claude.ai"> to identify the target site.
    const isLocalhost = rawHostname === 'localhost' || rawHostname === '127.0.0.1';
    const hostname = isLocalhost ? (document.body.dataset.idleSite ?? rawHostname) : rawHostname;
    const siteOffset = SITE_OFFSETS[hostname] ?? { x: 0, y: 0 };
    let realProviderActive = false;

    // ── Inject Panel into shadow DOM ─────────────────────────────────────────
    const ui = await createShadowRootUi(ctx, {
      name: 'idle-panel',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = mount(Panel, { target: container, props: { siteOffset } });
        panelHandle = app as unknown as PanelHandle;
        // Drain any events that arrived before mount
        for (const msg of pendingEvents.splice(0)) {
          dispatchToPanel(msg);
        }
        return app;
      },
      onRemove(app) {
        if (app) unmount(app as Parameters<typeof unmount>[0]);
        panelHandle = null;
      },
    });
    ui.mount();

    // ── Listen for PANEL_EVENT from background SW ────────────────────────────
    chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
      if (msg.type === 'PANEL_EVENT') {
        dispatchToPanel(msg);
      }
    });

    // ── Start claude.ai provider ──────────────────────────────────────────────
    if (hostname === 'claude.ai') {
      const { provider: claudeProvider } = await import('./detectors/claude');

      const dispatch = (event: WaitEvent): void => {
        chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
          console.error('[Idle] Failed to send wait event:', err);
        });
      };

      claudeProvider.start(dispatch);
      realProviderActive = true;
      console.log('[Idle] claude.ai provider started');
    }

    // ── Start chatgpt.com provider ────────────────────────────────────────────
    if (hostname === 'chatgpt.com') {
      const { provider: chatgptProvider } = await import('./detectors/chatgpt');

      const dispatch = (event: WaitEvent): void => {
        chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
          console.error('[Idle] Failed to send wait event:', err);
        });
      };

      chatgptProvider.start(dispatch);
      realProviderActive = true;
      console.log('[Idle] chatgpt.com provider started');
    }

    // ── Start gemini.google.com provider ──────────────────────────────────────
    if (hostname === 'gemini.google.com') {
      const { provider: geminiProvider } = await import('./detectors/gemini');

      const dispatch = (event: WaitEvent): void => {
        chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
          console.error('[Idle] Failed to send wait event:', err);
        });
      };

      geminiProvider.start(dispatch);
      realProviderActive = true;
      console.log('[Idle] gemini.google.com provider started');
    }

    // ── Start perplexity.ai provider ──────────────────────────────────────────
    if (hostname === 'perplexity.ai' || hostname === 'www.perplexity.ai') {
      const { provider: perplexityProvider } = await import('./detectors/perplexity');

      const dispatch = (event: WaitEvent): void => {
        chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
          console.error('[Idle] Failed to send wait event:', err);
        });
      };

      perplexityProvider.start(dispatch);
      realProviderActive = true;
      console.log('[Idle] perplexity.ai provider started');
    }

    // ── Test-mode provider: only on explicit TRIGGER_TEST_MODE message ────────
    // Never auto-starts on page load — requires the toggle-wait hotkey (or popup
    // button) to send TRIGGER_TEST_MODE from the background SW.
    // Skipped on any site where a real provider is already active.
    if (__TEST_MODE__) {
      const { testModeProvider } = await import('./detectors/test-mode');

      const dispatch = (event: WaitEvent): void => {
        chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
          console.error('[Idle] Failed to send wait event to background SW:', err);
        });
      };

      let activeHandle: { stop(): void } | null = null;

      chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
        if (msg.type !== 'TRIGGER_TEST_MODE') return;
        if (realProviderActive) {
          console.log('[Idle] TRIGGER_TEST_MODE ignored — real provider is active on this site');
          return;
        }
        // Stop any in-progress sequence before starting a fresh one
        activeHandle?.stop();
        activeHandle = testModeProvider.start(dispatch);
        console.log('[Idle] Test-mode triggered. wait_start at T+5s, wait_end at T+20s.');
      });
    }
  },
});
