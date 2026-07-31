import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleEditorFilter } from './ModuleEditorFilter';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

vi.mock('../../../customizer/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../customizer/index.js')>();
  return {
    ...actual,
    useAppDataLookup: () => ({ providers: { static: {} } }),
    useAppDataProviders: () => ['static'],
    useAppDataKeys: () => ['side', 'ccy'],
  };
});

describe('ModuleEditorFilter', () => {
  it('renders editor and filter selects', () => {
    render(<ModuleEditorFilter state={makeFormatterState()} actions={makeFormatterActions()} />);
    expect(screen.getByTestId('fmt-editor-select')).toBeInTheDocument();
    expect(screen.getByTestId('fmt-filter-select')).toBeInTheDocument();
  });

  it('shows values popover for select editor kind', async () => {
    const user = userEvent.setup();
    render(
      <ModuleEditorFilter
        state={makeFormatterState({
          cellEditorKind: 'agSelectCellEditor',
          cellEditorValues: ['BUY', 'SELL'],
        })}
        actions={makeFormatterActions()}
      />,
    );
    await user.click(screen.getByTestId('fmt-editor-values-trigger'));
    expect(screen.getByTestId('fmt-editor-values-popover')).toBeInTheDocument();
    expect(screen.getByTestId('fmt-editor-values-static-input')).toHaveValue('BUY, SELL');
  });

  it('commits static values on confirm', async () => {
    const user = userEvent.setup();
    const setCellEditorValues = vi.fn();
    render(
      <ModuleEditorFilter
        state={makeFormatterState({
          cellEditorKind: 'agRichSelectCellEditor',
          cellEditorValues: ['A'],
        })}
        actions={makeFormatterActions({ setCellEditorValues })}
      />,
    );
    await user.click(screen.getByTestId('fmt-editor-values-trigger'));
    await user.clear(screen.getByTestId('fmt-editor-values-static-input'));
    await user.type(screen.getByTestId('fmt-editor-values-static-input'), 'BUY, SELL');
    await user.click(screen.getByTestId('fmt-editor-values-confirm'));
    expect(setCellEditorValues).toHaveBeenCalledWith({ values: ['BUY', 'SELL'], valuesSource: undefined });
  });

  it('toggles floating filter pill', () => {
    const toggleFloatingFilter = vi.fn();
    render(
      <ModuleEditorFilter
        state={makeFormatterState({ floatingFilterOn: false })}
        actions={makeFormatterActions({ toggleFloatingFilter })}
      />,
    );
    fireEvent.mouseDown(screen.getByTestId('fmt-floating-filter-toggle'));
    expect(toggleFloatingFilter).toHaveBeenCalled();
  });

  it('commits appdata values source binding', async () => {
    const user = userEvent.setup();
    const setCellEditorValues = vi.fn();
    render(
      <ModuleEditorFilter
        state={makeFormatterState({
          cellEditorKind: 'agSelectCellEditor',
        })}
        actions={makeFormatterActions({ setCellEditorValues })}
      />,
    );
    await user.click(screen.getByTestId('fmt-editor-values-trigger'));
    await user.click(screen.getByTestId('fmt-editor-values-mode-appdata'));
    await user.click(screen.getByTestId('fmt-editor-values-provider'));
    await user.click(screen.getByRole('option', { name: 'static' }));
    await user.click(screen.getByTestId('fmt-editor-values-key'));
    await user.click(screen.getByRole('option', { name: 'side' }));
    await user.click(screen.getByTestId('fmt-editor-values-confirm'));
    expect(setCellEditorValues).toHaveBeenCalledWith({
      valuesSource: '{{static.side}}',
      values: undefined,
    });
  });

  it('shows custom filter badge when filterIsCustom', () => {
    render(
      <ModuleEditorFilter
        state={makeFormatterState({ filterIsCustom: true, filterPrimaryKind: undefined })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Column filter' })).toBeDisabled();
  });
});
