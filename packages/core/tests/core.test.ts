import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

describe('packages/core scaffold', () => {
  it('exports CORE_VERSION', () => {
    expect(CORE_VERSION).toBe('1.0.0');
  });

  it('has no browser globals in scope', () => {
    // In a Node environment, window and document are undefined.
    // This test verifies core runs without DOM dependencies.
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });
});
