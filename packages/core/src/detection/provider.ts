import type { WaitEvent } from './types';

export type WaitProviderState = 'idle' | 'waiting' | 'error';

export interface WaitProviderHandle {
  stop(): void;
  readonly state: WaitProviderState;
}

export interface WaitProvider {
  readonly contextKey: string;
  readonly providerVersion: string;
  readonly lastVerified: string;
  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle;
}
