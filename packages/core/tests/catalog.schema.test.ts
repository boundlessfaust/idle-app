import { describe, expect, it } from 'vitest';
import { catalog } from '../src/activities/catalog';

describe('catalog schema', () => {
  it('has at least 36 activities', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(36);
  });

  it('has no duplicate IDs', () => {
    const ids = catalog.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all activities have required fields with correct types', () => {
    for (const a of catalog) {
      expect(a.id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
      expect(typeof a.category).toBe('string');
      expect(['PhysicalReset', 'ContextPreserving', 'WriteOnly', 'Diffuse']).toContain(a.category);
      expect(a.waitBands.length).toBeGreaterThan(0);
      expect(typeof a.title).toBe('string');
      expect(typeof a.body).toBe('string');
      expect(typeof a.durationHintSec).toBe('number');
      expect(a.requiresInput).toBe(false);
    }
  });

  it('all title fields are 8 words or fewer', () => {
    for (const a of catalog) {
      const wordCount = a.title.trim().split(/\s+/).length;
      expect(wordCount, `"${a.id}" title has ${wordCount} words: "${a.title}"`).toBeLessThanOrEqual(
        8,
      );
    }
  });

  it('no body fields contain exclamation marks', () => {
    for (const a of catalog) {
      expect(a.body, `"${a.id}" body contains "!"`).not.toContain('!');
    }
  });

  it('all activities have requiresInput: false', () => {
    for (const a of catalog) {
      expect(a.requiresInput).toBe(false);
    }
  });

  it('all waitBands values are valid', () => {
    const validBands = new Set(['short', 'medium-short', 'medium-long', 'long']);
    for (const a of catalog) {
      for (const band of a.waitBands) {
        expect(validBands.has(band), `"${a.id}" has invalid band "${band}"`).toBe(true);
      }
    }
  });

  it('has the expected category distribution', () => {
    const counts = { PhysicalReset: 0, ContextPreserving: 0, WriteOnly: 0, Diffuse: 0 };
    for (const a of catalog) {
      counts[a.category]++;
    }
    expect(counts.PhysicalReset).toBeGreaterThanOrEqual(12);
    expect(counts.ContextPreserving).toBeGreaterThanOrEqual(10);
    expect(counts.WriteOnly).toBeGreaterThanOrEqual(8);
    expect(counts.Diffuse).toBeGreaterThanOrEqual(6);
  });
});
