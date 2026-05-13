<script lang="ts">
import type { Activity } from '@idle/core/activities/catalog';
import type { WaitBand } from '@idle/core/detection/types';
import PromptCaptureNudge from './PromptCaptureNudge.svelte';

interface Props {
  activity: Activity;
  band: WaitBand | 'unknown';
  promptText?: string;
  promptCaptureEnabled: boolean;
  promptCaptureNudgeDismissed: boolean;
  onEnablePromptCapture: () => void;
  onDismissNudge: () => void;
}

const {
  activity,
  band,
  promptText,
  promptCaptureEnabled,
  promptCaptureNudgeDismissed,
  onEnablePromptCapture,
  onDismissNudge,
}: Props = $props();

const BAND_LABELS: Record<string, string> = {
  short: '<1 min',
  'medium-short': '1–3 min',
  'medium-long': '3–5 min',
  long: '5+ min',
  unknown: '',
};

const showNudge = $derived(
  activity.category === 'ContextPreserving' &&
    !promptCaptureEnabled &&
    !promptCaptureNudgeDismissed,
);
</script>

<div class="activity-card" aria-live="polite" aria-atomic="true">
  <div class="card-meta">
    <span class="card-band">{BAND_LABELS[band] ?? ''}</span>
    <span class="card-duration">{activity.durationHintSec}s</span>
  </div>
  <h2 class="card-title">{activity.title}</h2>
  <p class="card-body">{activity.body}</p>

  {#if activity.category === 'ContextPreserving' && promptCaptureEnabled && promptText}
    <blockquote class="card-prompt">{promptText}</blockquote>
  {/if}

  {#if showNudge}
    <PromptCaptureNudge onEnable={onEnablePromptCapture} onDismiss={onDismissNudge} />
  {/if}
</div>

<style>
  .activity-card {
    padding: 0;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .card-band,
  .card-duration {
    font-size: 11px;
    color: var(--idle-muted);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .card-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--idle-secondary);
    line-height: 1.3;
  }

  .card-body {
    margin: 0;
    font-size: 14px;
    font-weight: 400;
    color: var(--idle-primary);
    line-height: 1.6;
  }

  .card-prompt {
    margin: 10px 0 0;
    padding: 6px 10px;
    border-left: 2px solid var(--idle-accent);
    font-size: 12px;
    color: var(--idle-muted);
    line-height: 1.5;
    font-style: italic;
    word-break: break-word;
  }
</style>
