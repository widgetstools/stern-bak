import { describe, expect, it } from 'vitest';
import {
  CONFIGURABLE_RENDERER_IDS, cellRendererCatalogue, cellRendererCatalogueByCategory,
  cellRendererComponents, getCellRendererEntry, type CellRendererId,
} from '../src/cellRendererRegistry';

/**
 * This registry is the contract between three places: the AG Grid
 * `gridOptions.components` map (string id -> renderer class), the column
 * settings dropdown (catalogue metadata), and the stored profile state
 * (`cellRendererId`). If those drift, a saved profile references a renderer id
 * that AG Grid cannot resolve and the column renders blank — so the tests
 * target agreement between them rather than any single renderer.
 */

const componentIds = Object.keys(cellRendererComponents) as CellRendererId[];
const catalogueIds = cellRendererCatalogue.map((e) => e.id);

describe('cellRendererComponents', () => {
  it('registers at least the documented renderer set', () => {
    expect(componentIds.length).toBeGreaterThan(20);
  });

  it('maps every id to a constructable renderer class', () => {
    for (const id of componentIds) {
      expect(typeof cellRendererComponents[id], id).toBe('function');
    }
  });

  it('is frozen so AG Grid prop sync does not see a new object each render', () => {
    expect(Object.isFrozen(cellRendererComponents)).toBe(true);
  });
});

describe('catalogue / components agreement', () => {
  it('every catalogue entry has a registered component', () => {
    const missing = catalogueIds.filter((id) => !(id in cellRendererComponents));
    expect(missing, 'catalogue advertises renderers AG Grid cannot resolve').toEqual([]);
  });

  it('every registered component appears in the catalogue', () => {
    const unlisted = componentIds.filter((id) => !catalogueIds.includes(id));
    expect(unlisted, 'renderers exist but cannot be chosen in the UI').toEqual([]);
  });

  it('has no duplicate catalogue ids', () => {
    expect(new Set(catalogueIds).size).toBe(catalogueIds.length);
  });

  it('gives every entry a label and description', () => {
    for (const e of cellRendererCatalogue) {
      expect(e.label.length, e.id).toBeGreaterThan(0);
      expect(e.description.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('cellRendererCatalogueByCategory', () => {
  it('partitions the catalogue — every entry appears exactly once', () => {
    const flat = Object.values(cellRendererCatalogueByCategory).flat();
    expect(flat.map((e) => e.id).sort()).toEqual([...catalogueIds].sort());
  });

  it('files each entry under its declared category', () => {
    for (const [category, entries] of Object.entries(cellRendererCatalogueByCategory)) {
      const wrong = entries.filter((e) => e.category !== category).map((e) => e.id);
      expect(wrong, `mis-filed under ${category}`).toEqual([]);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(cellRendererCatalogueByCategory)).toBe(true);
  });
});

describe('CONFIGURABLE_RENDERER_IDS', () => {
  it('matches exactly the entries flagged configurable in the catalogue', () => {
    // The editor shows a "needs config" badge from the catalogue flag but
    // decides whether it can author config from this set — they must agree.
    const flagged = cellRendererCatalogue.filter((e) => e.configurable).map((e) => e.id).sort();
    expect([...CONFIGURABLE_RENDERER_IDS].sort()).toEqual(flagged);
  });

  it('contains only registered ids', () => {
    for (const id of CONFIGURABLE_RENDERER_IDS) expect(componentIds).toContain(id);
  });
});

describe('getCellRendererEntry', () => {
  it('returns the entry for a known id', () => {
    expect(getCellRendererEntry('pill')?.label).toBe('Pill');
  });

  it('returns undefined for an unknown id', () => {
    expect(getCellRendererEntry('not-a-renderer')).toBeUndefined();
  });

  it('returns undefined for undefined or empty input', () => {
    expect(getCellRendererEntry(undefined)).toBeUndefined();
    expect(getCellRendererEntry('')).toBeUndefined();
  });

  it('resolves every catalogue id', () => {
    for (const id of catalogueIds) expect(getCellRendererEntry(id)?.id, id).toBe(id);
  });
});
