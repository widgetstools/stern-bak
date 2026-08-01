/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/engine';
import { createHeaderPainter, hasHeaderPaintRules } from './headerPainter.js';
import type { ConditionalStylingState } from '../state.js';

function makeState(rules: ConditionalStylingState['rules']): ConditionalStylingState {
  return { rules };
}

describe('hasHeaderPaintRules', () => {
  it('detects header flash and indicator rules', () => {
    expect(hasHeaderPaintRules(makeState([]))).toBe(false);
    expect(hasHeaderPaintRules(makeState([{
      id: 'r1',
      enabled: true,
      expression: '[price] > 0',
      scope: { type: 'cell', columns: ['price'] },
      flash: { enabled: true, target: 'headers', color: 'amber', mode: 'oneShot' },
    }]))).toBe(true);
    expect(hasHeaderPaintRules(makeState([{
      id: 'r2',
      enabled: true,
      expression: '[price] > 0',
      scope: { type: 'cell', columns: ['price'] },
      indicator: { icon: 'arrow-up', target: 'cells+headers' },
    }]))).toBe(true);
  });

  it('ignores disabled rules and row scope', () => {
    expect(hasHeaderPaintRules(makeState([{
      id: 'r3',
      enabled: false,
      expression: 'true',
      scope: { type: 'cell', columns: ['price'] },
      flash: { enabled: true, target: 'headers', color: 'amber', mode: 'oneShot' },
    }]))).toBe(false);
    expect(hasHeaderPaintRules(makeState([{
      id: 'r4',
      enabled: true,
      expression: 'true',
      scope: { type: 'row' },
      flash: { enabled: true, target: 'headers', color: 'amber', mode: 'oneShot' },
    }]))).toBe(false);
  });
});

describe('createHeaderPainter', () => {
  it('adds and removes header flash classes based on matching rows', () => {
    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'price');
    document.body.appendChild(header);

    const engine = new ExpressionEngine();
    const diffCacheByApi = new WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>();
    const platform = {
      api: {
        api: {
          forEachNodeAfterFilter: (cb: (node: { data: Record<string, unknown> }) => void) => {
            cb({ data: { price: 100 } });
          },
        },
      },
      getState: () => makeState([{
        id: 'flash1',
        enabled: true,
        expression: '[price] > 0',
        scope: { type: 'cell', columns: ['price'] },
        flash: { enabled: true, target: 'headers', color: 'amber', mode: 'oneShot' },
      }]),
      resources: { expression: () => engine },
    };

    const painter = createHeaderPainter(platform as never, diffCacheByApi);
    painter.evaluate();
    expect(header.className).toContain('ds-flash-hdr-flash1');

    platform.getState = () => makeState([]);
    painter.evaluate();
    expect(header.className).not.toContain('ds-flash-hdr-flash1');

    header.remove();
  });

  it('no-ops when api or document is unavailable', () => {
    const painter = createHeaderPainter({
      api: { api: null },
      getState: () => makeState([]),
      resources: { expression: () => new ExpressionEngine() },
    } as never, new WeakMap());
    expect(() => painter.evaluate()).not.toThrow();
  });

  it('swallows compile failures per rule', () => {
    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'price');
    document.body.appendChild(header);

    const compile = vi.fn(() => {
      throw new Error('bad expr');
    });
    const painter = createHeaderPainter({
      api: {
        api: {
          forEachNodeAfterFilter: (cb: (node: { data: Record<string, unknown> }) => void) => {
            cb({ data: { price: 1 } });
          },
        },
      },
      getState: () => makeState([{
        id: 'bad',
        enabled: true,
        expression: '((((',
        scope: { type: 'cell', columns: ['price'] },
        flash: { enabled: true, target: 'headers', color: 'amber', mode: 'oneShot' },
      }]),
      resources: { expression: () => ({ compile }) },
    } as never, new WeakMap());
    painter.evaluate();
    expect(header.className).not.toContain('ds-flash-hdr-bad');
    header.remove();
  });
});
