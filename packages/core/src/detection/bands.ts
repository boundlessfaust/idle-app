import type { WaitBand } from './types';

// Band boundaries in elapsed-wait milliseconds (ascending)
const BAND_THRESHOLDS_MS = [60_000, 180_000, 300_000] as const;

export function elapsedToBand(ms: number): WaitBand {
  if (ms < 60_000) return 'short';
  if (ms < 180_000) return 'medium-short';
  if (ms < 300_000) return 'medium-long';
  return 'long';
}

/**
 * Milliseconds until the current wait crosses into the next band,
 * or null when already in the terminal band ('long').
 * Hosts use this to schedule band-escalation timers.
 */
export function msUntilNextBand(elapsedMs: number): number | null {
  for (const threshold of BAND_THRESHOLDS_MS) {
    if (elapsedMs < threshold) return threshold - elapsedMs;
  }
  return null;
}
