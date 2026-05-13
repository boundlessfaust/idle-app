<script lang="ts">
import { saveSettings } from '../../../lib/store/storage';

interface Props {
  onMuteWait: () => void; // in-memory mute for this wait
}

const { onMuteWait }: Props = $props();

let menuOpen = $state(false);

function muteThisWait() {
  menuOpen = false;
  onMuteWait();
}

async function muteOneHour() {
  menuOpen = false;
  await saveSettings({ muteUntil: Date.now() + 3_600_000 });
  onMuteWait();
}

function toggle() {
  menuOpen = !menuOpen;
}
</script>

<div class="mute-wrapper">
  <button class="mute-btn" onclick={toggle} aria-haspopup="true" aria-expanded={menuOpen}>
    Mute
  </button>

  {#if menuOpen}
    <div class="mute-menu" role="menu">
      <button class="mute-option" role="menuitem" onclick={muteThisWait}>
        Mute for this wait
      </button>
      <button class="mute-option" role="menuitem" onclick={muteOneHour}>Mute for 1 hour</button>
    </div>
  {/if}
</div>

<style>
  .mute-wrapper {
    position: relative;
  }

  .mute-btn {
    padding: 0;
    min-height: 44px;
    min-width: 44px;
    background: none;
    border: none;
    font-size: 12px;
    color: var(--idle-muted);
    cursor: pointer;
    font-family: inherit;
    letter-spacing: 0.02em;
  }

  .mute-btn:hover {
    color: var(--idle-secondary);
  }

  .mute-btn:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .mute-menu {
    position: absolute;
    bottom: calc(100% + 4px);
    right: 0;
    background: var(--idle-bg);
    border: 1px solid var(--idle-border);
    border-radius: 4px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    z-index: 10;
  }

  .mute-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    min-height: 44px;
    background: none;
    border: none;
    text-align: left;
    font-size: 12px;
    color: var(--idle-secondary);
    cursor: pointer;
    font-family: inherit;
  }

  .mute-option:hover {
    background: var(--idle-surface-alt);
  }

  .mute-option:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: -2px;
  }
</style>
