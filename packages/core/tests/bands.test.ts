import { describe, expect, it } from 'vitest';
import { elapsedToBand, msUntilNextBand } from '../src/detection/bands';

describe('elapsedToBand', () => {
  it('0 ms → short', () => expect(elapsedToBand(0)).toBe('short'));
  it('59 999 ms → short (just below 60 s boundary)', () =>
    expect(elapsedToBand(59_999)).toBe('short'));
  it('60 000 ms → medium-short (at 60 s boundary)', () =>
    expect(elapsedToBand(60_000)).toBe('medium-short'));
  it('179 999 ms → medium-short (just below 3 min boundary)', () =>
    expect(elapsedToBand(179_999)).toBe('medium-short'));
  it('180 000 ms → medium-long (at 3 min boundary)', () =>
    expect(elapsedToBand(180_000)).toBe('medium-long'));
  it('299 999 ms → medium-long (just below 5 min boundary)', () =>
    expect(elapsedToBand(299_999)).toBe('medium-long'));
  it('300 000 ms → long (at 5 min boundary)', () => expect(elapsedToBand(300_000)).toBe('long'));
  it('very large value → long', () => expect(elapsedToBand(Number.MAX_SAFE_INTEGER)).toBe('long'));
});

describe('msUntilNextBand', () => {
  it('0 ms → 60 000 ms until medium-short', () => expect(msUntilNextBand(0)).toBe(60_000));
  it('59 999 ms → 1 ms until medium-short', () => expect(msUntilNextBand(59_999)).toBe(1));
  it('60 000 ms → 120 000 ms until medium-long (at 60 s boundary)', () =>
    expect(msUntilNextBand(60_000)).toBe(120_000));
  it('179 999 ms → 1 ms until medium-long', () => expect(msUntilNextBand(179_999)).toBe(1));
  it('180 000 ms → 120 000 ms until long (at 3 min boundary)', () =>
    expect(msUntilNextBand(180_000)).toBe(120_000));
  it('299 999 ms → 1 ms until long', () => expect(msUntilNextBand(299_999)).toBe(1));
  it('300 000 ms → null (long is terminal)', () => expect(msUntilNextBand(300_000)).toBeNull());
  it('very large value → null', () => expect(msUntilNextBand(Number.MAX_SAFE_INTEGER)).toBeNull());
});
