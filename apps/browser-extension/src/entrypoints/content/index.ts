import type { WaitEvent } from '@idle/core/detection/types';
import { mount, unmount } from 'svelte';
import Panel from './ui/Panel.svelte';

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
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // ── Inject Panel into shadow DOM ─────────────────────────────────────────
    const ui = await createShadowRootUi(ctx, {
      name: 'idle-panel',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = mount(Panel, { target: container });
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

    // ── Test-mode provider: only starts on explicit TRIGGER_TEST_MODE message ──
    // Never auto-starts on page load — requires the toggle-wait hotkey (or popup
    // button) to send TRIGGER_TEST_MODE from the background SW.
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
        // Stop any in-progress sequence before starting a fresh one
        activeHandle?.stop();
        activeHandle = testModeProvider.start(dispatch);
        console.log('[Idle] Test-mode triggered. wait_start at T+5s, wait_end at T+20s.');
      });
    }
  },
});
