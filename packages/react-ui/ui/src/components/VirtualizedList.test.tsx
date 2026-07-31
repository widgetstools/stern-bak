import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  measureItemHeight,
  useVirtualScroll,
  VirtualizedList,
} from './VirtualizedList.js';

afterEach(cleanup);

function renderList<T>(
  overrides: Partial<React.ComponentProps<typeof VirtualizedList<T>>> = {},
) {
  const items = overrides.items ?? ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  return render(
    <VirtualizedList
      items={items}
      itemHeight={40}
      containerHeight={80}
      renderItem={(item) => <div>{String(item)}</div>}
      {...overrides}
    />,
  );
}

describe('VirtualizedList', () => {
  it('shows a loading state instead of rows', () => {
    renderList({ items: [], loading: true });

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows the default empty message when there are no items', () => {
    renderList({ items: [] });

    expect(screen.getByText('No items to display')).toBeInTheDocument();
  });

  it('renders a custom empty state when provided', () => {
    renderList({ items: [], emptyState: <p>Nothing here</p> });

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('virtualizes a long list so only the visible window is mounted', () => {
    const many = Array.from({ length: 200 }, (_, index) => `row-${index}`);
    renderList({ items: many, overscan: 0 });

    const mounted = screen.getAllByText(/^row-/);
    expect(mounted.length).toBeLessThan(20);
    expect(mounted.length).toBeGreaterThan(0);
  });

  it('uses a custom key extractor for row identity', () => {
    renderList({
      items: [{ id: 'a' }, { id: 'b' }],
      getItemKey: (item) => item.id,
      renderItem: (item) => <div>{item.id}</div>,
    });

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('scrolls back to the top when the search query changes', () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set');
    const { rerender } = render(
      <VirtualizedList
        items={['one', 'two', 'three']}
        itemHeight={40}
        containerHeight={80}
        searchQuery=""
        renderItem={(item) => <div>{item}</div>}
      />,
    );

    rerender(
      <VirtualizedList
        items={['one', 'two', 'three']}
        itemHeight={40}
        containerHeight={80}
        searchQuery="one"
        renderItem={(item) => <div>{item}</div>}
      />,
    );

    expect(scrollTo).toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('merges a caller className on the scroll container', () => {
    const { container } = renderList({ className: 'border rounded-md' });

    expect(container.firstElementChild).toHaveClass('border', 'rounded-md');
  });

  it('updates the visible slice when the user scrolls', () => {
    renderList({
      items: Array.from({ length: 50 }, (_, index) => `item-${index}`),
      overscan: 0,
    });

    const scroller = screen.getByText('item-0').closest('.overflow-auto') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 400, writable: true });
    fireEvent.scroll(scroller);

    expect(screen.queryByText('item-0')).not.toBeInTheDocument();
    expect(screen.getByText('item-10')).toBeInTheDocument();
  });
});

describe('useVirtualScroll', () => {
  it('computes the visible index window from scroll position', () => {
    function Probe() {
      const slice = useVirtualScroll(100, 20, 60, 1);
      return (
        <div>
          {slice.startIndex}-{slice.endIndex}-{slice.visibleCount}
        </div>
      );
    }

    render(<Probe />);
    expect(screen.getByText('0-4-5')).toBeInTheDocument();
  });
});

describe('measureItemHeight', () => {
  it('returns zero when the element is missing', () => {
    expect(measureItemHeight(null)).toBe(0);
  });

  it('reads height from getBoundingClientRect', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () =>
      ({ height: 48 } as DOMRect);

    expect(measureItemHeight(element)).toBe(48);
  });
});
