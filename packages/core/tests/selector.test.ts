import { describe, expect, it, vi } from 'vitest';
import type { Activity, ActivityCategory, WaitBand } from '../src/activities/catalog';
import { catalog } from '../src/activities/catalog';
import {
  BAND_CATEGORIES,
  type SelectorInput,
  createSelector,
  getBand,
  selectActivity,
} from '../src/activities/selector';

// ── helpers ──────────────────────────────────────────────────────────────────

function act(id: string, category: ActivityCategory, waitBands: WaitBand[]): Activity {
  return {
    id,
    category,
    waitBands,
    title: `T ${id}`,
    body: 'Body.',
    durationHintSec: 10,
    requiresInput: false,
  };
}

function inp(overrides: Partial<SelectorInput> = {}): SelectorInput {
  return { band: 'short', history: [], windowN: 30, disabledCategories: new Set(), ...overrides };
}

// ── getBand ───────────────────────────────────────────────────────────────────

describe('getBand', () => {
  it('returns unknown for null elapsed', () => {
    expect(getBand(null)).toBe('unknown');
  });

  it('returns short for 0–59,999 ms', () => {
    expect(getBand(0)).toBe('short');
    expect(getBand(59_999)).toBe('short');
  });

  it('returns medium-short for 60,000–179,999 ms', () => {
    expect(getBand(60_000)).toBe('medium-short');
    expect(getBand(179_999)).toBe('medium-short');
  });

  it('returns medium-long for 180,000–299,999 ms', () => {
    expect(getBand(180_000)).toBe('medium-long');
    expect(getBand(299_999)).toBe('medium-long');
  });

  it('returns long for >= 300,000 ms', () => {
    expect(getBand(300_000)).toBe('long');
    expect(getBand(900_000)).toBe('long');
  });
});

// ── selectActivity — real catalog happy paths ─────────────────────────────────

describe('selectActivity with real catalog', () => {
  it('returns an activity for each band', () => {
    const bands: WaitBand[] = ['short', 'medium-short', 'medium-long', 'long'];
    for (const band of bands) {
      const result = selectActivity(inp({ band }));
      expect(result, `expected activity for band "${band}"`).not.toBeNull();
      expect(BAND_CATEGORIES[band]).toContain(result?.category);
    }
  });

  it('unknown band resolves to short — returns a PhysicalReset activity', () => {
    const result = selectActivity(inp({ band: 'unknown' }));
    expect(result).not.toBeNull();
    expect(BAND_CATEGORIES.short).toContain(result?.category);
  });

  it('excludes disabled category from pool', () => {
    // medium-long has ContextPreserving + WriteOnly; disable WriteOnly
    // Run enough times to be statistically certain only ContextPreserving is returned
    for (let i = 0; i < 30; i++) {
      const result = selectActivity(
        inp({ band: 'medium-long', disabledCategories: new Set(['WriteOnly']) }),
      );
      expect(result?.category).toBe('ContextPreserving');
    }
  });

  it('respects history window — skips recently seen activity', () => {
    // Leave exactly one short-band activity out of history; only that one should be returned
    const shortActs = catalog.filter((a) => a.waitBands.includes('short'));
    // shortActs.length > 1 guaranteed by catalog (12 PhysicalReset)
    const [kept, ...rest] = shortActs;
    if (!kept) throw new Error('catalog must have short-band activities');
    const history = rest.map((a) => a.id);

    for (let i = 0; i < 10; i++) {
      const result = selectActivity(inp({ band: 'short', history }));
      expect(result?.id).toBe(kept.id);
    }
  });
});

// ── createSelector — edge cases (mock catalog) ────────────────────────────────

describe('createSelector edge cases', () => {
  it('re-shuffles when all band activities have been seen (pool exhausted)', () => {
    // Two short-band activities; both are in history → pool exhausted → re-shuffle
    const acts = [
      act('pr-a', 'PhysicalReset', ['short']),
      act('pr-b', 'PhysicalReset', ['short']),
      act('cp-x', 'ContextPreserving', ['medium-long']), // different band — exercises && short-circuit
    ];
    const sel = createSelector(acts);
    const result = sel(inp({ history: ['pr-a', 'pr-b'] }));
    expect(result).not.toBeNull();
    expect(['pr-a', 'pr-b']).toContain(result?.id);
  });

  it('falls through to full band pool when only eligible category is disabled', () => {
    // short only has PhysicalReset; disable it → fallthrough uses full short pool (pr-a)
    const acts = [
      act('pr-a', 'PhysicalReset', ['short']),
      act('cp-x', 'ContextPreserving', ['medium-long']), // different band — not returned
    ];
    const sel = createSelector(acts);

    const result = sel(inp({ disabledCategories: new Set(['PhysicalReset']) }));

    expect(result?.id).toBe('pr-a');
  });

  it('returns null when no activities match band + enabled categories (pool.length === 0)', () => {
    // Only medium-long activities; querying short → pool empty → null
    const acts = [act('cp-a', 'ContextPreserving', ['medium-long'])];
    const sel = createSelector(acts);
    const result = sel(inp({ band: 'short' }));
    expect(result).toBeNull();
  });

  it('returns null when fallthrough pool is also empty (empty catalog)', () => {
    // Empty catalog + all categories disabled → fallthrough pool is empty → null
    const sel = createSelector([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = sel(inp({ disabledCategories: new Set(['PhysicalReset']) }));

    warnSpy.mockRestore();
    expect(result).toBeNull();
  });

  it('history window expiry: full pool available with empty history', () => {
    // Simulate post-expiry state: background SW cleared history → full pool returned
    const acts = [act('pr-a', 'PhysicalReset', ['short']), act('pr-b', 'PhysicalReset', ['short'])];
    const sel = createSelector(acts);
    const result = sel(inp({ history: [] }));
    expect(result).not.toBeNull();
    expect(['pr-a', 'pr-b']).toContain(result?.id);
  });

  it('windowN limits how far back history is considered', () => {
    // pr-a is in history but beyond the windowN=1 cutoff → treated as unseen
    const acts = [act('pr-a', 'PhysicalReset', ['short']), act('pr-b', 'PhysicalReset', ['short'])];
    const sel = createSelector(acts);
    // history = ['pr-a', 'pr-b']; windowN=1 → only 'pr-b' is recent; pr-a is available
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = sel(inp({ history: ['pr-a', 'pr-b'], windowN: 1 }));
      if (r) results.add(r.id);
    }
    expect(results.has('pr-a')).toBe(true);
  });
});
