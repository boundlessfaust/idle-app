import type { WaitEvent } from '@idle/core/detection/types';
import { checkHotkeyConflict } from '../lib/detection/fallback';

interface ExtensionMessage {
  type: string;
  event?: WaitEvent;
}

export default defineBackground(() => {
  // Track manual hotkey toggle state (background-SW-scoped)
  let waitActive = false;

  // Check for shortcut conflict immediately on SW startup
  checkHotkeyConflict();

  // Manual hotkey: Ctrl/Cmd+Shift+L toggles wait_start / wait_end
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-wait') return;

    const event: WaitEvent = waitActive
      ? { type: 'wait_end', at: Date.now() }
      : { type: 'wait_start', at: Date.now() };
    waitActive = !waitActive;

    console.log(`[Idle] ${event.type} (hotkey)`, event);
    broadcastToContentScripts({ type: 'WAIT_EVENT', event });
  });

  // Receive wait events forwarded from content-script providers
  chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender) => {
    if (msg.type === 'WAIT_EVENT' && msg.event) {
      const tabId = (sender.tab?.id ?? 'unknown').toString();
      console.log(`[Idle] ${msg.event.type} (tab:${tabId})`, msg.event);
      // Phase 4: check muteUntil from Dexie before forwarding to panel UI
    }
  });
});

function broadcastToContentScripts(msg: ExtensionMessage): void {
  // Phase 4: targeted broadcast to active-wait tabs; for now broadcast all
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Expected for tabs without the content script injected
        });
      }
    }
  });
}
