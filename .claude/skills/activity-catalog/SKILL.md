---
name: activity-catalog
description: >
  Use when adding, editing, or auditing activities in packages/core/activities/catalog.ts,
  or when modifying selector logic in packages/core/activities/selector.ts.
  Enforces hand-curation rules, schema validation, rotation logic, and the hard
  constraint that no LLM-generated activity text ever enters the catalog.
compatibility: Claude Code. Requires packages/core/activities/ to exist.
---

## Non-Negotiable Rule
**NEVER generate activity `title` or `body` text with an LLM.**
All catalog content is hand-curated by a human. If you are asked to generate activity
text, refuse and ask the user to provide the copy themselves.

## Activity Interface

```typescript
// packages/core/activities/catalog.ts

export type ActivityCategory = 'PhysicalReset' | 'ContextPreserving' | 'WriteOnly' | 'Diffuse';
export type WaitBand = 'short' | 'medium-short' | 'medium-long' | 'long';

export interface Activity {
  id: string;              // kebab-case, e.g. "pr-breath-3". Globally unique. Never reuse retired IDs.
  category: ActivityCategory;
  waitBands: WaitBand[];   // Must include at least one band
  title: string;           // ≤ 8 words. No exclamation marks.
  body: string;            // 1–2 sentences. No exclamation marks. Plain imperative tone.
  durationHintSec: number; // Realistic seconds for the activity
  requiresInput: false;    // Always false in v1
  citation?: string;       // Key from packages/core/research/citations.ts — required if research-backed
}
```

## Catalog Rules

### ID format
- Prefix by category: `pr-` (PhysicalReset), `cp-` (ContextPreserving), `wo-` (WriteOnly), `df-` (Diffuse)
- Lowercase, hyphen-separated. Max 24 chars.
- NEVER reuse an ID that has been retired from the catalog.

### Copy tone
- Title: imperative verb phrase, ≤ 8 words, no punctuation at end
- Body: 1–2 sentences, plain language, no exclamation marks, no motivational framing
- Bad: "Energize yourself with a quick stretch!"
- Good: "Right arm overhead, lean gently left. Switch sides. Breathe through it."

### Wait band eligibility
- `short` (0–60s): low-commitment physical only; avoid anything requiring thought
- `medium-short` (60s–3m): can add context-preserving review
- `medium-long` (3m–5m): context review + write-only capture
- `long` (5m+): diffuse + write-only; avoid physical (user may have walked away)

### Citation requirement
If an activity references a specific physiological or cognitive effect, add a `citation` key
that maps to `packages/core/research/citations.ts`. PR template enforces this.

## Catalog Targets
| Category | Target count | Current |
|---|---|---|
| PhysicalReset | 12 | 12 |
| ContextPreserving | 10 | 10 |
| WriteOnly | 8 | 8 |
| Diffuse | 6 | 6 |
| **Total** | **36** | **36** |

Growing the catalog beyond 36 is fine; do not shrink below 36.

## Selector Logic Rules (`packages/core/activities/selector.ts`)

```
Band → eligible categories:
  short         → PhysicalReset
  medium-short  → PhysicalReset, ContextPreserving
  medium-long   → ContextPreserving, WriteOnly
  long          → Diffuse, WriteOnly
  unknown       → start at short, escalate per band crossing
```

### Rotation algorithm
1. Filter catalog to activities eligible for current band + enabled categories
2. Remove activities seen in the last N sessions (default N=30, configurable)
3. If pool is empty after filtering: re-shuffle full eligible set (loop, not escalate)
4. Pick randomly from remaining pool
5. Record selected activity ID in global `rotationHistory` (Dexie, in browser host)
6. Rotation history resets on time-window expiry (default 4h, configurable)

### Category disabled fallthrough
If a disabled category is the only option for a band:
- Fall through to the next eligible category silently
- Log a console warning (dev mode only)
- Do NOT throw or show an error to the user

### 100% unit test coverage requirement
`selector.ts` must have 100% branch coverage via Vitest before any UI code is written.
Run: `bun run test --coverage packages/core/activities/selector.ts`

## Schema Validation Test

Every catalog PR must pass this test:

```typescript
// tests/unit/catalog.schema.test.ts
import { catalog } from '@idle/core/activities/catalog';

describe('catalog schema', () => {
  it('has no duplicate IDs', () => {
    const ids = catalog.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('all activities have required fields', () => {
    for (const a of catalog) {
      expect(a.id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
      expect(a.title.split(' ').length).toBeLessThanOrEqual(8);
      expect(a.body).not.toMatch(/!/);
      expect(a.waitBands.length).toBeGreaterThan(0);
      expect(a.requiresInput).toBe(false);
    }
  });
  it('has at least 36 activities', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(36);
  });
});
```

## Checklist Before Submitting a Catalog PR
- [ ] Activity text is human-written (confirm explicitly)
- [ ] ID is unique and follows prefix convention
- [ ] `title` ≤ 8 words, no exclamation marks
- [ ] `body` 1–2 sentences, no exclamation marks
- [ ] `waitBands` are appropriate for the activity's commitment level
- [ ] `citation` present if activity references research
- [ ] Schema validation test passes
- [ ] Selector unit tests still at 100% coverage
