<script lang="ts">
import type { Activity } from '@idle/core/activities/catalog';
import type { WaitBand } from '@idle/core/detection/types';

interface Props {
  activity: Activity;
  band: WaitBand | 'unknown';
}

const { activity, band }: Props = $props();

const BAND_LABELS: Record<string, string> = {
  short: '<1 min',
  'medium-short': '1–3 min',
  'medium-long': '3–5 min',
  long: '5+ min',
  unknown: '',
};
</script>

<div class="activity-card" aria-live="polite" aria-atomic="true">
  <div class="card-meta">
    <span class="card-band">{BAND_LABELS[band] ?? ''}</span>
    <span class="card-duration">{activity.durationHintSec}s</span>
  </div>
  <h2 class="card-title">{activity.title}</h2>
  <p class="card-body">{activity.body}</p>
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

</style>
