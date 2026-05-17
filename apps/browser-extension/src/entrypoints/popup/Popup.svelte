<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { clearPinnedNote, getPinnedNote, getSettings, saveSettings } from '../../lib/store/storage';

let enabled = $state(true);
let detectionMode = $state<'auto' | 'manual'>('auto');
let muteUntil = $state(0);
let hotkeyConflict = $state(false);
let pinnedNote = $state<string | null>(null);
let copied = $state(false);
let now = $state(Date.now());

const isMuted = $derived(muteUntil > now);
const muteButtonLabel = $derived(
  isMuted
    ? (() => {
        const d = new Date(muteUntil);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `Muted until ${hh}:${mm}`;
      })()
    : 'Mute for 1 hour',
);

let clockInterval: ReturnType<typeof setInterval> | null = null;

function handleRuntimeMessage(msg: { type: string }) {
  if (msg.type === 'hotkey_conflict') hotkeyConflict = true;
}

onMount(async () => {
  const settings = await getSettings();
  enabled = settings.enabled;
  detectionMode = settings.detectionMode ?? 'auto';
  muteUntil = settings.muteUntil;

  const stored = await chrome.storage.local.get(['hotkeyConflict']);
  hotkeyConflict = stored.hotkeyConflict === true;

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  pinnedNote = await getPinnedNote();

  clockInterval = setInterval(() => {
    now = Date.now();
  }, 5_000);
});

onDestroy(() => {
  if (clockInterval) clearInterval(clockInterval);
  chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
});

async function toggleEnabled() {
  enabled = !enabled;
  await saveSettings({ enabled });
}

async function cycleDetectionMode() {
  detectionMode = detectionMode === 'auto' ? 'manual' : 'auto';
  await saveSettings({ detectionMode });
}

async function muteOneHour() {
  if (isMuted) return;
  const expiry = Date.now() + 3_600_000;
  muteUntil = expiry;
  now = Date.now();
  await saveSettings({ muteUntil: expiry });
}

async function copyNote() {
  if (!pinnedNote) return;
  await navigator.clipboard.writeText(pinnedNote);
  copied = true;
  setTimeout(() => {
    copied = false;
  }, 2_000);
}

async function clearNote() {
  await clearPinnedNote();
  pinnedNote = null;
}

function openShortcuts() {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}
</script>

<div class="popup">
  {#if hotkeyConflict}
    <div class="conflict-banner" role="alert">
      <span>Hotkey unset — manual toggle won't fire.</span>
      <button class="conflict-link" onclick={openShortcuts}>Set shortcut →</button>
    </div>
  {/if}

  <div class="row">
    <span class="label">Idle</span>
    <button
      class="toggle"
      class:on={enabled}
      onclick={toggleEnabled}
      aria-pressed={enabled}
      aria-label={enabled ? 'Disable Idle' : 'Enable Idle'}
    >
      {enabled ? 'On' : 'Off'}
    </button>
  </div>

  <div class="divider"></div>

  <div class="row">
    <span class="label">Detection</span>
    <button
      class="mode-btn"
      onclick={cycleDetectionMode}
      aria-label="Toggle detection mode"
      title={detectionMode === 'auto'
        ? 'Switch to manual hotkey only'
        : 'Switch to automatic detection'}
    >
      {detectionMode === 'auto' ? 'Auto' : 'Manual only'}
    </button>
  </div>

  <div class="row">
    <button
      class="mute-btn"
      class:muted={isMuted}
      onclick={muteOneHour}
      disabled={isMuted}
      aria-label={muteButtonLabel}
    >
      {muteButtonLabel}
    </button>
  </div>

  {#if pinnedNote}
    <div class="note-section">
      <div class="note-header">
        <span class="label">Next Prompt</span>
        <div class="note-actions">
          <button class="action-btn" onclick={copyNote} aria-label="Copy note to clipboard">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button class="action-btn" onclick={clearNote} aria-label="Clear note">Clear</button>
        </div>
      </div>
      <p class="note-text">{pinnedNote}</p>
    </div>
  {/if}

  <div class="footer">
    <button class="settings-link" onclick={openOptions} aria-label="Open settings">Settings</button>
  </div>
</div>

<style>
  .popup {
    width: 100%;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .conflict-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: #f5ede0;
    border: 1px solid #e8d5b7;
    border-radius: 4px;
    font-size: 12px;
    color: #5a4a30;
  }

  .conflict-link {
    background: none;
    border: none;
    color: #7a5a20;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    white-space: nowrap;
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 44px;
    min-width: 44px;
  }

  .conflict-link:hover {
    color: #5a3a00;
  }

  .conflict-link:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .divider {
    height: 1px;
    background: #e8e8e8;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    font-size: 13px;
    color: #555;
    font-weight: 500;
    flex-shrink: 0;
  }

  .toggle {
    min-width: 56px;
    min-height: 44px;
    padding: 5px 14px;
    border-radius: 20px;
    border: 1px solid #ccc;
    background: #eee;
    color: #777;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 180ms,
      color 180ms,
      border-color 180ms;
  }

  .toggle.on {
    background: #5b9e9a;
    border-color: #4a8a86;
    color: #fff;
  }

  .toggle:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .mode-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 5px 12px;
    border-radius: 4px;
    border: 1px solid #ddd;
    background: #f2f2f0;
    color: #444;
    font-size: 12px;
    cursor: pointer;
  }

  .mode-btn:hover {
    background: #e8e8e5;
  }

  .mode-btn:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .mute-btn {
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #ddd;
    background: #f2f2f0;
    color: #444;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
  }

  .mute-btn.muted {
    background: #ebebeb;
    color: #aaa;
    border-color: #e0e0e0;
    cursor: default;
  }

  .mute-btn:not(.muted):hover {
    background: #e8e8e5;
  }

  .mute-btn:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .note-section {
    border-top: 1px solid #e8e8e8;
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .note-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    background: none;
    border: none;
    color: #5b9e9a;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    min-height: 44px;
    min-width: 44px;
    border-radius: 3px;
  }

  .action-btn:hover {
    color: #4a8a86;
    background: #f0f0ee;
  }

  .action-btn:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .note-text {
    font-size: 12px;
    color: #555;
    line-height: 1.5;
    background: #f2f2f0;
    border: 1px solid #e8e8e8;
    border-radius: 4px;
    padding: 8px;
    max-height: 80px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .footer {
    border-top: 1px solid #e8e8e8;
    padding-top: 8px;
    display: flex;
    justify-content: flex-end;
  }

  .settings-link {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 11px;
    padding: 4px 8px;
    min-height: 44px;
    min-width: 44px;
    border-radius: 3px;
  }

  .settings-link:hover {
    color: #555;
    background: #f0f0ee;
  }

  .settings-link:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }
</style>
