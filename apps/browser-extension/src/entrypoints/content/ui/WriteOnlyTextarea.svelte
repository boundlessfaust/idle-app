<script lang="ts">
import { clearPinnedNote, savePinnedNote } from '../../../lib/store/storage';

interface Props {
  initialText?: string;
  initialPinned?: boolean;
}

const { initialText = '', initialPinned = false }: Props = $props();

let text = $state(initialText);
let pinned = $state(initialPinned);

async function onInput(e: Event) {
  text = (e.target as HTMLTextAreaElement).value;
  if (pinned) {
    await savePinnedNote(text);
  }
}

async function togglePin() {
  pinned = !pinned;
  if (pinned) {
    await savePinnedNote(text);
  } else {
    await clearPinnedNote();
  }
}
</script>

<div class="wo-wrapper">
  <div class="wo-header">
    <span class="wo-label">Scratch space</span>
    <button
      class="pin-btn"
      class:pinned
      onclick={togglePin}
      aria-label={pinned ? 'Unpin note (will clear on next wait)' : 'Pin note (keeps across waits)'}
      title={pinned ? 'Pinned' : 'Pin'}
    >
      {pinned ? '📌' : '📍'}
    </button>
  </div>
  <textarea
    class="wo-textarea"
    class:pinned-border={pinned}
    value={text}
    oninput={onInput}
    placeholder="Type here — not saved unless pinned."
    rows={3}
    aria-label="Write-only scratch space"
  ></textarea>
</div>

<style>
  .wo-wrapper {
    margin-top: 10px;
  }

  .wo-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .wo-label {
    font-size: 11px;
    color: var(--idle-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .pin-btn {
    padding: 2px 4px;
    min-height: 44px;
    min-width: 44px;
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 120ms ease;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pin-btn:hover,
  .pin-btn.pinned {
    opacity: 1;
  }

  .pin-btn.pinned {
    color: var(--idle-accent);
  }

  .pin-btn:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .wo-textarea {
    width: 100%;
    padding: 6px 8px;
    font-size: 13px;
    font-family: inherit;
    color: var(--idle-primary);
    background: var(--idle-surface-alt);
    border: 1px solid var(--idle-border);
    border-radius: 4px;
    resize: none;
    line-height: 1.5;
    box-sizing: border-box;
  }

  .wo-textarea.pinned-border {
    border-color: var(--idle-accent);
  }

  .wo-textarea:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 1px;
  }

  .wo-textarea::placeholder {
    color: var(--idle-muted);
    opacity: 0.7;
  }
</style>
