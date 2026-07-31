import { describe, expect, it, vi } from 'vitest';
import { buildFloatingFilterDom } from './streamSafeFloatingFilterDom';

describe('buildFloatingFilterDom', () => {
  it('builds AG-Grid-shaped DOM with input and clear button', () => {
    const onInput = vi.fn();
    const onClearMouseDown = vi.fn();
    const dom = buildFloatingFilterDom({
      placeholder: 'Filter…',
      onInput,
      onClearMouseDown,
    });

    expect(dom.eGui.className).toContain('ag-floating-filter-input');
    expect(dom.input.placeholder).toBe('Filter…');
    expect(dom.clearBtn.style.display).toBe('none');

    dom.input.value = 'abc';
    dom.syncClearVisibility();
    expect(dom.clearBtn.style.display).toBe('inline-block');

    dom.input.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalled();

    dom.clearBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onClearMouseDown).toHaveBeenCalled();
  });

  it('hides clear button when input is empty', () => {
    const dom = buildFloatingFilterDom({
      placeholder: 'x',
      onInput: () => {},
      onClearMouseDown: () => {},
    });
    dom.input.value = 'x';
    dom.syncClearVisibility();
    dom.input.value = '';
    dom.syncClearVisibility();
    expect(dom.clearBtn.style.display).toBe('none');
  });
});
