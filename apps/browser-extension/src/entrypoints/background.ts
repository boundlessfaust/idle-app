import type { WaitEvent } from '@idle/core/detection/types';
import { checkHotkeyConflict } from '../lib/detection/fallback';
import type { DetectorLogRecord } from '../lib/store/db';
import { logDetectorFailure, pruneDetectorLogs } from '../lib/store/detectorLogs';
import { getSettings } from '../lib/store/storage';

interface ExtensionMessage {
  type: string;
  event?: WaitEvent;
}

// Singleton active-wait state: which tab is currently waiting
interface ActiveWait {
  tabId: number;
  hostname: string;
  startedAt: number;
}

let activeWait: ActiveWait | null = null;

interface LogFailureMessage {
  type: 'LOG_DETECTOR_FAILURE';
  entry: Omit<DetectorLogRecord, 'id'>;
}

export default defineBackground(() => {
  // Check for shortcut conflict on SW startup
  checkHotkeyConflict();

  // Prune stale detector logs on each SW startup (best-effort)
  pruneDetectorLogs().catch((err: unknown) => {
    console.error('[Idle] Failed to prune detector logs:', err);
  });

  // Manual hotkey: Ctrl/Cmd+Shift+L
  // TEST_MODE builds: triggers the test sequence in the content script (5s delay → panel)
  // Production builds: directly toggles wait_start / wait_end
  let hotkeyActive = false;
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-wait') return;

    if (__TEST_MODE__) {
      console.log('[Idle] toggle-wait (hotkey) → TRIGGER_TEST_MODE');
      broadcastPanelEvent({ type: 'TRIGGER_TEST_MODE' });
      return;
    }

    const event: WaitEvent = hotkeyActive
      ? { type: 'wait_end', at: Date.now() }
      : { type: 'wait_start', at: Date.now() };
    hotkeyActive = !hotkeyActive;

    console.log(`[Idle] ${event.type} (hotkey)`, event);
    broadcastPanelEvent({ type: 'PANEL_EVENT', event });
  });

  // Write detector failure logs sent from content scripts (Dexie lives here, not in content bundle)
  chrome.runtime.onMessage.addListener((msg: LogFailureMessage | ExtensionMessage) => {
    if (msg.type !== 'LOG_DETECTOR_FAILURE') return;
    logDetectorFailure(msg.entry).catch((err: unknown) => {
      console.error('[Idle] Failed to write detector log:', err);
    });
  });

  // Receive WAIT_EVENT from content-script providers; forward to panel after mute check
  chrome.runtime.onMessage.addListener(
    (msg: ExtensionMessage, sender, sendResponse: (r: unknown) => void) => {
      if (msg.type !== 'WAIT_EVENT' || !msg.event) return;

      const tabId = sender.tab?.id;
      const url = sender.tab?.url ?? '';
      const hostname = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return '';
        }
      })();

      console.log(`[Idle] ${msg.event.type} (tab:${tabId ?? 'unknown'}, ${hostname})`, msg.event);

      handleWaitEvent(msg.event, tabId, hostname).catch((err: unknown) => {
        console.error('[Idle] Error handling wait event:', err);
      });

      // Return false — we handle asynchronously but don't use sendResponse
      sendResponse(undefined);
      return false;
    },
  );
});

async function handleWaitEvent(
  event: WaitEvent,
  tabId: number | undefined,
  hostname: string,
): Promise<void> {
  if (event.type === 'wait_start') {
    // Check enabled + mute before forwarding
    const settings = await getSettings();
    if (!settings.enabled) {
      console.log('[Idle] wait_start suppressed — Idle is disabled');
      return;
    }
    if (Date.now() < settings.muteUntil) {
      console.log('[Idle] wait_start suppressed — muted until', new Date(settings.muteUntil));
      return;
    }

    // Multi-tab singleton: if another tab has an active wait on same hostname, dismiss it
    if (activeWait && activeWait.hostname === hostname && activeWait.tabId !== tabId) {
      chrome.tabs
        .sendMessage(activeWait.tabId, {
          type: 'PANEL_EVENT',
          event: { type: 'wait_end', at: Date.now() },
        })
        .catch(() => {
          // Tab may have closed — expected
        });
    }

    if (tabId !== undefined) {
      activeWait = { tabId, hostname, startedAt: event.at };
    }
  } else if (event.type === 'wait_end') {
    if (activeWait?.tabId === tabId) {
      activeWait = null;
    }
  }

  if (tabId === undefined) return;
  chrome.tabs.sendMessage(tabId, { type: 'PANEL_EVENT', event }).catch((err: unknown) => {
    console.error(`[Idle] Could not send PANEL_EVENT to tab ${tabId}:`, err);
  });
}

function broadcastPanelEvent(msg: ExtensionMessage): void {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Expected for tabs without the content script
        });
      }
    }
  });
}
