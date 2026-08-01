import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColumnMetaStrip } from './ColumnMetaStrip';

describe('ColumnMetaStrip', () => {
  it('always renders core chips and conditional pinned/filter chips', () => {
    render(
      <ColumnMetaStrip
        colId="price"
        cellDataType="number"
        overrideCount={2}
        templateCount={1}
        dirty
        draft={{
          colId: 'price',
          initialPinned: 'left',
          filter: { enabled: true, kind: 'agNumberColumnFilter' },
        }}
      />,
    );
    expect(screen.getByTestId('cols-meta-price')).toBeTruthy();
    expect(screen.getByTestId('cols-meta-dirty-price').textContent).toMatch(/DIRTY/i);
    expect(screen.getByTestId('cols-meta-overrides-price').textContent).toContain('2');
    expect(screen.getByTestId('cols-meta-pinned-price')).toBeTruthy();
    expect(screen.getByTestId('cols-meta-filter-price')).toBeTruthy();
  });

  it('omits conditional chips when draft has no pinned/filter/hide', () => {
    render(
      <ColumnMetaStrip
        colId="qty"
        cellDataType="number"
        overrideCount={0}
        templateCount={0}
        dirty={false}
        draft={{ colId: 'qty' }}
      />,
    );
    expect(screen.queryByTestId('cols-meta-pinned-qty')).toBeNull();
    expect(screen.queryByTestId('cols-meta-filter-qty')).toBeNull();
  });
});
