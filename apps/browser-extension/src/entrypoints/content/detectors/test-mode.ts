import type {
  WaitProvider,
  WaitProviderHandle,
  WaitProviderState,
} from '@idle/core/detection/provider';
import type { WaitEvent } from '@idle/core/detection/types';

export const testModeProvider: WaitProvider = {
  contextKey: 'web:test-mode',
  providerVersion: '1.0.0',
  lastVerified: '2026-05-12',

  start(dispatch: (e: WaitEvent) => void): WaitProviderHandle {
    let _state: WaitProviderState = 'idle';
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    // T+5s: fire wait_start; T+20s: fire wait_end
    startTimer = setTimeout(() => {
      startTimer = null;
      _state = 'waiting';
      dispatch({ type: 'wait_start', at: Date.now() });

      endTimer = setTimeout(() => {
        endTimer = null;
        _state = 'idle';
        dispatch({ type: 'wait_end', at: Date.now() });
      }, 15_000);
    }, 5_000);

    return {
      stop() {
        if (startTimer !== null) {
          clearTimeout(startTimer);
          startTimer = null;
        }
        if (endTimer !== null) {
          clearTimeout(endTimer);
          endTimer = null;
        }
        _state = 'idle';
      },
      get state() {
        return _state;
      },
    };
  },
};
