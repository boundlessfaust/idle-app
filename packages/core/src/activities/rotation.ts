/**
 * Returns true when the rotation history should be cleared and lastResetAt updated.
 * False when auto-reset is disabled (windowHours=0) or the clock has not been seeded yet (lastResetAt=0).
 */
export function rotationWindowExpired(
  windowHours: number,
  lastResetAt: number,
  now: number,
): boolean {
  if (windowHours === 0) return false;
  if (lastResetAt === 0) return false;
  return now - lastResetAt > windowHours * 3_600_000;
}
