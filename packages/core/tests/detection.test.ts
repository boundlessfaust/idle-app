import { describe, expect, it } from 'vitest';
import type {
  WaitProvider,
  WaitProviderHandle,
  WaitProviderState,
} from '../src/detection/provider';
import { getProvider, listContextKeys, registerProvider } from '../src/detection/registry';
import type { WaitEvent } from '../src/detection/types';

function makeMock(contextKey: string): WaitProvider {
  return {
    contextKey,
    providerVersion: '1.0.0',
    lastVerified: '2026-01-01',
    start(_dispatch: (e: WaitEvent) => void): WaitProviderHandle {
      let _state: WaitProviderState = 'idle';
      return {
        stop() {
          _state = 'idle';
        },
        get state() {
          return _state;
        },
      };
    },
  };
}

describe('WaitProvider registry', () => {
  it('returns undefined for an unregistered contextKey', () => {
    expect(getProvider('web:unregistered-test')).toBeUndefined();
  });

  it('registers and retrieves a provider', () => {
    registerProvider('web:test-a', () => makeMock('web:test-a'));
    const provider = getProvider('web:test-a');
    expect(provider).toBeDefined();
    expect(provider?.contextKey).toBe('web:test-a');
  });

  it('each getProvider call invokes the factory (new instance)', () => {
    registerProvider('web:test-b', () => makeMock('web:test-b'));
    const p1 = getProvider('web:test-b');
    const p2 = getProvider('web:test-b');
    expect(p1).not.toBe(p2);
  });

  it('listContextKeys includes registered keys', () => {
    registerProvider('web:test-c', () => makeMock('web:test-c'));
    expect(listContextKeys()).toContain('web:test-c');
  });

  it('provider handle start/stop cycle works', () => {
    registerProvider('web:test-d', () => makeMock('web:test-d'));
    const provider = getProvider('web:test-d');
    if (!provider) throw new Error('Provider should be registered');
    const handle = provider.start(() => {});
    expect(handle.state).toBe('idle');
    handle.stop();
    expect(handle.state).toBe('idle');
  });
});

describe('WaitProvider core isolation', () => {
  it('runs in Node without DOM globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    // @ts-expect-error — chrome is a browser global; must not exist in core
    expect(typeof chrome).toBe('undefined');
  });
});
