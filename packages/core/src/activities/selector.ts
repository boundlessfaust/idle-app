import type { ActivityCategory, WaitBand } from './catalog';
import { type Activity, catalog } from './catalog';

export type WaitBandOrUnknown = WaitBand | 'unknown';

// Band → eligible category order (earlier entries take priority in fallthrough)
export const BAND_CATEGORIES: Readonly<Record<WaitBand, readonly ActivityCategory[]>> = {
  short: ['PhysicalReset'],
  'medium-short': ['PhysicalReset', 'ContextPreserving'],
  'medium-long': ['ContextPreserving', 'WriteOnly'],
  long: ['Diffuse', 'WriteOnly'],
};

export function getBand(elapsedMs: number | null): WaitBandOrUnknown {
  if (elapsedMs === null) return 'unknown';
  if (elapsedMs < 60_000) return 'short';
  if (elapsedMs < 180_000) return 'medium-short';
  if (elapsedMs < 300_000) return 'medium-long';
  return 'long';
}

export interface SelectorInput {
  band: WaitBandOrUnknown;
  /** IDs of recently shown activities (global across all sites). Newest last. */
  history: readonly string[];
  /** How many recent IDs to treat as seen. Default 30. */
  windowN: number;
  disabledCategories: ReadonlySet<ActivityCategory>;
}

export function createSelector(
  activities: readonly Activity[],
): (input: SelectorInput) => Activity | null {
  return function selectActivity(input: SelectorInput): Activity | null {
    const effectiveBand: WaitBand = input.band === 'unknown' ? 'short' : input.band;
    const eligibleCategories = BAND_CATEGORIES[effectiveBand];
    const enabledCategories = eligibleCategories.filter((c) => !input.disabledCategories.has(c));

    let pool: Activity[];
    if (enabledCategories.length > 0) {
      pool = activities.filter(
        (a) => a.waitBands.includes(effectiveBand) && enabledCategories.includes(a.category),
      );
    } else {
      // All eligible categories for this band are disabled — fall through to full band pool
      console.warn(
        `[idle] All categories disabled for band "${effectiveBand}"; using full band pool`,
      );
      pool = activities.filter((a) => a.waitBands.includes(effectiveBand));
    }

    if (pool.length === 0) return null;

    const recentIds = new Set(input.history.slice(-input.windowN));
    let available = pool.filter((a) => !recentIds.has(a.id));

    if (available.length === 0) {
      // Pool exhausted — re-shuffle and loop from beginning
      available = [...pool];
    }

    // biome-ignore lint/style/noNonNullAssertion: index is in [0, available.length-1]; length > 0 guaranteed above
    return available[Math.floor(Math.random() * available.length)]!;
  };
}

export const selectActivity = createSelector(catalog);
