import type { WaitBand } from './types';

export function elapsedToBand(ms: number): WaitBand {
  if (ms < 60_000) return 'short';
  if (ms < 180_000) return 'medium-short';
  if (ms < 300_000) return 'medium-long';
  return 'long';
}
