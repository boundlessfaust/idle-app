export type WaitEvent = { type: 'wait_start'; at: number } | { type: 'wait_end'; at: number };

export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long' | 'unknown';

export interface WaitState {
  active: boolean;
  band: WaitBand;
  startedAt: number | null;
}
