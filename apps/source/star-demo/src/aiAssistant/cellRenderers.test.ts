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
    // `barColor` is included because percent-bar renders nothing without it —
    // the previous fixture here was a config that would have drawn a blank cell.
    const config = { max: 30, barColor: { dark: '#7cc7f9' }, showValue: true };
    const res = normalizeRenderer({ id: 'percent-bar', config });
    expect(res.ok === true && res.value).toEqual({
      cellRendererId: 'percent-bar',
      cellRendererConfig: { kind: 'percent-bar', config },
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

/**
 * A configurable renderer resolves its config through a `pick<Name>Cfg` guard
 * in the design system; when a required key is missing that guard returns
 * `undefined` and the cell silently renders plain text. The assistant used to
 * write `config: {}` for a bare id, which meant "apply pills to this column"
 * reported success, changed nothing on screen, and left a config the settings
 * editor crashed on.
 */
describe('required config — refusing renderers that would draw nothing', () => {
  it('refuses a bare id for a renderer that needs config, naming what is missing', () => {
    const res = normalizeRenderer('pill');
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('"rules"');
    expect(res.ok === false && res.error).toContain('renders nothing');
  });

  it('names every missing key, not just the first', () => {
    const res = normalizeRenderer({ id: 'rating-delta', config: { scale: ['AAA', 'AA'] } });
    expect(res.ok).toBe(false);
    const err = res.ok === false ? res.error : '';
    expect(err).toContain('"previousField"');
    expect(err).toContain('"upColor"');
    expect(err).not.toContain('"scale"'); // supplied, so not reported missing
  });

  it('accepts a complete config', () => {
    const res = normalizeRenderer({
      id: 'pill',
      config: { rules: [{ value: 'AAA', bg: { dark: '#103418' } }] },
    });
    expect(res.ok).toBe(true);
  });

  it('still accepts a bare id for a zero-config renderer', () => {
    expect(normalizeRenderer('pnl-value').ok).toBe(true);
  });

  /** Anything listed as required must actually be a key the renderer reads. */
  it('only requires keys on renderers that are configurable', () => {
    for (const entry of CELL_RENDERERS) {
      if (entry.requiredConfig?.length) expect(entry.configurable, entry.id).toBe(true);
    }
  });
});
