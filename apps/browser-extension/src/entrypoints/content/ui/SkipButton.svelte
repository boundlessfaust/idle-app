<script lang="ts">
interface Props {
  onSkip: () => void;
}

const { onSkip }: Props = $props();
</script>

<button class="skip-btn" onclick={onSkip} aria-label="Skip to next activity">Skip</button>

<style>
  .skip-btn {
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

  .skip-btn:hover {
    color: var(--idle-secondary);
  }

  .skip-btn:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }
</style>
