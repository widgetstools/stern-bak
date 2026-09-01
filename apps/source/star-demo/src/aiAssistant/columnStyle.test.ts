import { describe, expect, it } from 'vitest';
import { normalizeColumnStyleArgs, mergeThemedStyle, describeColumnStyle } from './columnStyle';

function ok(args: Record<string, unknown>) {
  const res = normalizeColumnStyleArgs({ colId: 'marketValue', ...args });
  if (!res.ok) throw new Error(`expected ok, got: ${res.error}`);
  return res.value;
}
function err(args: Record<string, unknown>): string {
  const res = normalizeColumnStyleArgs({ colId: 'marketValue', ...args });
  if (res.ok) throw new Error('expected a rejection');
  return res.error;
}

describe('typography beyond bold/italic', () => {
  it('accepts underline and font size', () => {
    const style = ok({ underline: true, fontSize: 13 });
    expect(style.underline).toBe(true);
    expect(style.fontSize).toBe(13);
  });

  it('rejects a nonsensical font size', () => {
    expect(err({ fontSize: 0 })).toContain('positive');
    expect(err({ fontSize: 'big' })).toContain('positive');
  });

  it('merges typography into both theme slots', () => {
    const merged = mergeThemedStyle(undefined, ok({ underline: true, fontSize: 13 }));
    expect(merged.dark?.typography).toEqual({ underline: true, fontSize: 13 });
    expect(merged.light?.typography).toEqual({ underline: true, fontSize: 13 });
  });
});

describe('borders', () => {
  it('defaults the style to solid and keeps width and colour', () => {
    const style = ok({ borders: { bottom: { width: 1, color: '#3a4552' } } });
    expect(style.borders).toEqual({ bottom: { width: 1, color: '#3a4552', style: 'solid' } });
  });

  /** Setting one side must not silently remove the others. */
  it('merges per side rather than replacing the set', () => {
    const prev = mergeThemedStyle(undefined, ok({ borders: { top: { width: 2, color: '#111' } } }));
    const next = mergeThemedStyle(prev, ok({ borders: { bottom: { width: 1, color: '#222' } } }));
    expect(Object.keys(next.dark?.borders ?? {}).sort()).toEqual(['bottom', 'top']);
  });

  it('clears every side when asked', () => {
    const prev = mergeThemedStyle(undefined, ok({ borders: { top: { width: 2, color: '#111' } } }));
    const next = mergeThemedStyle(prev, ok({ clearBorders: true }));
    expect(next.dark?.borders).toBeUndefined();
  });

  it('rejects an unknown side, a bad width and a bad style', () => {
    expect(err({ borders: { middle: { width: 1, color: '#111' } } })).toContain('not a side');
    expect(err({ borders: { top: { width: -1, color: '#111' } } })).toContain('width');
    expect(err({ borders: { top: { width: 1, color: '#111', style: 'wavy' } } })).toContain('solid');
  });
});

describe('value formatters', () => {
  it('accepts all three kinds the toolbar can author', () => {
    expect(ok({ formatter: { kind: 'preset', preset: 'currency', options: { maximumFractionDigits: 0 } } }).formatter)
      .toEqual({ kind: 'preset', preset: 'currency', options: { maximumFractionDigits: 0 } });
    expect(ok({ formatter: { kind: 'excelFormat', format: '[Green]0.00;[Red]-0.00' } }).formatter)
      .toEqual({ kind: 'excelFormat', format: '[Green]0.00;[Red]-0.00' });
    expect(ok({ formatter: { kind: 'tick', tick: 'TICK32' } }).formatter).toEqual({ kind: 'tick', tick: 'TICK32' });
  });

  it('rejects an unknown kind, preset or tick token', () => {
    expect(err({ formatter: { kind: 'magic' } })).toContain('preset');
    expect(err({ formatter: { kind: 'preset', preset: 'furlongs' } })).toContain('currency');
    expect(err({ formatter: { kind: 'tick', tick: 'TICK7' } })).toContain('TICK32');
  });
});

describe('renderers and header-only targets', () => {
  it('normalizes a renderer into the stored two-field shape', () => {
    // `colorScale` is included because heatmap renders nothing without it —
    // the fixture used to encode a config that would have drawn a blank cell.
    const config = {
      domain: { min: 0, max: 10 },
      colorScale: { min: { dark: '#0f2b1c' }, max: { dark: '#3a1818' } },
    };
    const style = ok({ renderer: { id: 'heatmap', config } });
    expect(style.renderer).toEqual({
      cellRendererId: 'heatmap',
      cellRendererConfig: { kind: 'heatmap', config },
    });
  });

  /** A header has no value, so these would write something inert. */
  it('refuses value-only settings aimed solely at headers', () => {
    expect(err({ target: 'headers', formatPreset: 'currency' })).toContain('cell values');
    expect(err({ target: 'headers', renderer: 'pnl-value' })).toContain('cell values');
    expect(err({ target: 'headers', editable: true })).toContain('cell values');
  });

  it('allows those settings when headers are included alongside cells', () => {
    expect(ok({ target: 'cells+headers', formatPreset: 'currency' }).formatPreset).toBe('currency');
  });

  /** Renaming isn't a cells-vs-headers choice — it renames the column. */
  it('accepts headerName with a headers-only target', () => {
    expect(ok({ target: 'headers', headerName: 'Mkt Val' }).headerName).toBe('Mkt Val');
  });
});

describe('empty and summary', () => {
  it('rejects a call that would change nothing, listing what it accepts', () => {
    const message = err({});
    expect(message).toContain('borders');
    expect(message).toContain('renderer');
  });

  it('summarises every facet it applied', () => {
    const summary = describeColumnStyle(
      ok({ align: 'right', underline: true, fontSize: 12, headerName: 'Mkt Val', renderer: 'pnl-value' }),
    );
    expect(summary).toContain('right-aligned');
    expect(summary).toContain('underlined');
    expect(summary).toContain('12px');
    expect(summary).toContain('Mkt Val');
    expect(summary).toContain('pnl-value');
  });
});
