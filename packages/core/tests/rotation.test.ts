import { describe, expect, it } from 'vitest';
import { rotationWindowExpired } from '../src/activities/rotation';

const HOUR = 3_600_000;

describe('rotationWindowExpired', () => {
  it('windowHours=0 → false (auto-reset disabled)', () =>
    expect(rotationWindowExpired(0, Date.now() - 99 * HOUR, Date.now())).toBe(false));

  it('lastResetAt=0 → false (clock not yet seeded)', () =>
    expect(rotationWindowExpired(4, 0, Date.now())).toBe(false));

  it('window not yet elapsed → false', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(4, now - 3 * HOUR, now)).toBe(false);
  });

  it('exactly at window boundary → false (> not >=)', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(4, now - 4 * HOUR, now)).toBe(false);
  });

  it('one ms past window boundary → true', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(4, now - 4 * HOUR - 1, now)).toBe(true);
  });

  it('well past window → true', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(4, now - 10 * HOUR, now)).toBe(true);
  });

  it('1-hour window, 59 min elapsed → false', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(1, now - 59 * 60_000, now)).toBe(false);
  });

  it('1-hour window, 61 min elapsed → true', () => {
    const now = 1_000_000_000;
    expect(rotationWindowExpired(1, now - 61 * 60_000, now)).toBe(true);
  });
});
