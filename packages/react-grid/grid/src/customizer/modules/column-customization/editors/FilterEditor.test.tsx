import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilterEditor } from './FilterEditor';
import { pickNativeSelect } from '../../../test/selectHelpers';

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('FilterEditor', () => {
  it('enables filter and sets kind', async () => {
    const onChange = vi.fn();
    render(<FilterEditor colId="price" value={undefined} onChange={onChange} />);
    await pickNativeSelect('cols-price-filter-enabled', 'On');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));

    onChange.mockClear();
    await pickNativeSelect('cols-price-filter-kind', 'Number (agNumberColumnFilter)');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'agNumberColumnFilter' }),
    );
  });

  it('clears enabled flag back to host default while retaining kind', async () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        colId="price"
        value={{ enabled: true, kind: 'agTextColumnFilter' }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-price-filter-enabled', 'Host default');
    expect(onChange).toHaveBeenCalledWith({ kind: 'agTextColumnFilter' });
  });

  it('turns filter off and hides kind controls', async () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        colId="price"
        value={{ enabled: true, kind: 'agTextColumnFilter' }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-price-filter-enabled', 'Off');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, kind: 'agTextColumnFilter' }),
    );
  });

  it('toggles floating filter buttons debounce and closeOnApply', async () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        colId="qty"
        value={{ enabled: true, kind: 'agTextColumnFilter' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('cols-qty-filter-floating'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ floatingFilter: true }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('cols-qty-filter-btn-apply'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ buttons: ['apply'] }));

    onChange.mockClear();
    commitIconInput(screen.getByTestId('cols-qty-filter-debounce'), '250');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ debounceMs: 250 }));

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('cols-qty-filter-closeonapply'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ closeOnApply: true }));
  });

  it('auto-enables floating filter for stream-safe multi kinds', async () => {
    const onChange = vi.fn();
    render(<FilterEditor colId="sym" value={{ enabled: true }} onChange={onChange} />);
    await pickNativeSelect(
      'cols-sym-filter-kind',
      /Multi \+ Stream-Safe Floating Filter \(Text\)/,
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'streamSafeMultiColumnFilter', floatingFilter: true }),
    );
  });

  it('renders set-filter options editor', async () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        colId="status"
        value={{ enabled: true, kind: 'agSetColumnFilter' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('cols-status-setfilter-minifilter'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ setFilterOptions: expect.objectContaining({ suppressMiniFilter: true }) }),
    );

    onChange.mockClear();
    await pickNativeSelect('cols-status-setfilter-excel', 'Windows');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ setFilterOptions: expect.objectContaining({ excelMode: 'windows' }) }),
    );
  });

  it('adds and removes multi-filter entries', async () => {
    const onChange = vi.fn();
    render(
      <FilterEditor
        colId="mix"
        value={{
          enabled: true,
          kind: 'agMultiColumnFilter',
          multiFilters: [{ filter: 'agTextColumnFilter', display: 'inline' }],
        }}
        onChange={onChange}
      />,
    );
    await pickNativeSelect('cols-mix-multi-0-display', 'Sub-menu');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ multiFilters: [expect.objectContaining({ display: 'subMenu' })] }),
    );

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('cols-mix-multi-0-remove'));
    expect(onChange).toHaveBeenCalledWith({ enabled: true, kind: 'agMultiColumnFilter' });

    onChange.mockClear();
    await pickNativeSelect('cols-mix-multi-add', /Text/);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ multiFilters: expect.arrayContaining([expect.any(Object)]) }),
    );
  });
});
