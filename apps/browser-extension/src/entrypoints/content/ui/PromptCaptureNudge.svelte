<script lang="ts">
interface Props {
  onEnable: () => void;
  onDismiss: () => void;
}

const { onEnable, onDismiss }: Props = $props();
</script>

<div class="nudge" role="note">
  <p class="nudge-text">
    Want to see your prompt here? Stored locally for this session only — nothing leaves your
    browser.
  </p>
  <div class="nudge-actions">
    <button class="nudge-btn nudge-enable" onclick={onEnable}>Enable</button>
    <button class="nudge-btn nudge-dismiss" onclick={onDismiss}>Dismiss</button>
  </div>
</div>

<style>
  .nudge {
    margin-top: 10px;
    padding: 8px 10px;
    border: 1px solid var(--idle-border);
    border-radius: 4px;
    background: var(--idle-surface-alt);
  }

  .nudge-text {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--idle-muted);
    line-height: 1.5;
  }

  .nudge-actions {
    display: flex;
    gap: 8px;
  }

  .nudge-btn {
    padding: 5px 12px;
    min-height: 44px;
    min-width: 44px;
    font-size: 12px;
    border-radius: 3px;
    border: 1px solid var(--idle-border);
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
  }

  .nudge-enable {
    background: var(--idle-accent);
    color: var(--idle-accent-fg);
    border-color: var(--idle-accent);
  }

  .nudge-dismiss {
    background: transparent;
    color: var(--idle-muted);
  }

  .nudge-btn:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
  }
</style>
