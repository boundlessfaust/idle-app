import type { WaitEvent } from '@idle/core/detection/types';

export default defineContentScript({
  matches: [
    '*://claude.ai/*',
    '*://chatgpt.com/*',
    '*://gemini.google.com/*',
    '*://perplexity.ai/*',
  ],

  async main() {
    if (!__TEST_MODE__) return;

    const { testModeProvider } = await import('./detectors/test-mode');

    const dispatch = (event: WaitEvent): void => {
      chrome.runtime.sendMessage({ type: 'WAIT_EVENT', event }).catch((err: unknown) => {
        console.error('[Idle] Failed to send wait event to background SW:', err);
      });
    };

    const handle = testModeProvider.start(dispatch);
    console.log('[Idle] Test-mode provider started. contextKey:', testModeProvider.contextKey);
    console.log('[Idle] wait_start fires in ~5s, wait_end fires in ~20s. state:', handle.state);
  },
});
