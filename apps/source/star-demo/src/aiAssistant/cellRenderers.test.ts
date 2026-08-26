import { describe, expect, it } from 'vitest';
import { cellRendererCatalogue } from '@wellsfargo-starui/design-system/cell-renderers-registry';
import { CELL_RENDERERS, CELL_RENDERER_IDS, findCellRenderer, normalizeRenderer } from './cellRenderers';

/**
 * `cellRenderers.ts` copies the design-system catalogue rather than importing
 * it — that module also holds the renderer classes, which have no business in a
 * window with no grid. This is what keeps the copy honest.
 */
describe('catalogue parity with the design system', () => {
  it('lists exactly the same renderer ids', () => {
    expect([...CELL_RENDERER_IDS].sort()).toEqual(cellRendererCatalogue.map((r) => r.id).sort());
  });

  it('agrees on which renderers need configuration', () => {
    for (const real of cellRendererCatalogue) {
      expect(findCellRenderer(real.id)?.configurable, real.id).toBe(real.configurable);
    }
  });
});

describe('normalizeRenderer', () => {
  it('accepts a bare id for a zero-config renderer', () => {
    const res = normalizeRenderer('pnl-value');
    expect(res).toEqual({
      ok: true,
      value: { cellRendererId: 'pnl-value', cellRendererConfig: { kind: 'pnl-value', config: {} } },
    });
  });

  /** Both fields are written together: the id picks the renderer, the envelope
   *  carries its params. */
  it('wraps config in the { kind, config } envelope the transform reads', () => {
    const res = normalizeRenderer({ id: 'percent-bar', config: { max: 30, showValue: true } });
    expect(res.ok === true && res.value).toEqual({
      cellRendererId: 'percent-bar',
      cellRendererConfig: { kind: 'percent-bar', config: { max: 30, showValue: true } },
    });
  });

  /** An unknown id writes cleanly and renders nothing — the failure this guards. */
  it('rejects an unknown id and points at the catalogue', () => {
    const res = normalizeRenderer('sparkles');
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('list_cell_renderers');
    expect(res.ok === false && res.error).toContain('sparkline');
  });

  it('rejects config on a renderer that takes none, rather than silently dropping it', () => {
    const res = normalizeRenderer({ id: 'ticker', config: { colour: 'red' } });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('takes no configuration');
  });

  it('rejects a non-object config', () => {
    expect(normalizeRenderer({ id: 'pill', config: 'red' }).ok).toBe(false);
  });

  it('rejects a missing id', () => {
    expect(normalizeRenderer({ config: {} }).ok).toBe(false);
    expect(normalizeRenderer(undefined).ok).toBe(false);
  });
});
