import { describe, expect, it, vi } from 'vitest';
import { preserveGridCellOnMouseDown } from './preserveGridCell';

/** A mousedown whose target is an element of the given tag. */
function mousedownOn(tag: string) {
  const preventDefault = vi.fn();
  preserveGridCellOnMouseDown({ target: document.createElement(tag), preventDefault });
  return preventDefault;
}

describe('preserveGridCellOnMouseDown', () => {
  it.each(['div', 'button', 'span', 'h4', 'section'])(
    'eats mousedown on %s so the grid keeps its focused cell',
    (tag) => {
      expect(mousedownOn(tag)).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['input', 'select', 'option', 'textarea'])(
    'lets mousedown through to a %s so its own behaviour survives',
    (tag) => {
      // A native <select> opens its dropdown on mousedown; preventDefault
      // here is what once stopped the template dropdown from opening out of
      // the toolbar popover.
      expect(mousedownOn(tag)).not.toHaveBeenCalled();
    },
  );

  it('eats mousedown with no target at all', () => {
    const preventDefault = vi.fn();
    preserveGridCellOnMouseDown({ target: null, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
