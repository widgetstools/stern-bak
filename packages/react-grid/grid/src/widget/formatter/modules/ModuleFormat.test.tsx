import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleFormat } from './ModuleFormat';
import { makeFormatterActions, makeFormatterState, PERCENT_TEMPLATE, COMMA_TEMPLATE } from '../formatterTestHelpers';

vi.mock('../../../customizer/internal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../customizer/internal.js')>();
  return {
    ...actual,
    FormatterPicker: ({ 'data-testid': testId }: { 'data-testid'?: string }) => (
      <div data-testid={testId ?? 'fmt-picker-toolbar'} />
    ),
  };
});

describe('ModuleFormat', () => {
  it('disables format controls for header target', () => {
    render(
      <ModuleFormat
        state={makeFormatterState({ isHeader: true, pickerDataType: 'number' })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Currency format' })).toBeDisabled();
  });

  it('toggles percent format via pill', () => {
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState()}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Percentage' }));
    expect(doFormat).toHaveBeenCalledWith(PERCENT_TEMPLATE);
  });

  it('increase/decrease decimals buttons dispatch actions', () => {
    const increaseDecimals = vi.fn();
    const decreaseDecimals = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState({ fmt: { ...makeFormatterState().fmt, valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2 } } } })}
        actions={makeFormatterActions({ increaseDecimals, decreaseDecimals })}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'More decimals' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Fewer decimals' }));
    expect(increaseDecimals).toHaveBeenCalled();
    expect(decreaseDecimals).toHaveBeenCalled();
  });

  it('renders dual pickers for ALL scope on cells', () => {
    render(
      <ModuleFormat
        state={makeFormatterState({ scope: 'all', isHeader: false })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByTestId('fmt-picker-toolbar-number')).toBeInTheDocument();
    expect(screen.getByTestId('fmt-picker-toolbar-date')).toBeInTheDocument();
  });

  it('applies currency selection via ToolbarSelect', async () => {
    const user = userEvent.setup();
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState()}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Currency format' }));
    await user.click(screen.getByText('USD'));
    expect(doFormat).toHaveBeenCalled();
  });

  it('clears comma template when already active', () => {
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState({
          fmt: {
            ...makeFormatterState().fmt,
            valueFormatterTemplate: COMMA_TEMPLATE,
          },
        })}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Thousands (1,234)' }));
    expect(doFormat).toHaveBeenCalledWith(undefined);
  });

  it('clears percent format when pill is already active', () => {
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState({
          fmt: { ...makeFormatterState().fmt, valueFormatterTemplate: PERCENT_TEMPLATE },
        })}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Percentage' }));
    expect(doFormat).toHaveBeenCalledWith(undefined);
  });

  it('applies basis points via currency select', async () => {
    const user = userEvent.setup();
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState()}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Currency format' }));
    await user.click(screen.getByText('Basis points'));
    expect(doFormat).toHaveBeenCalled();
  });

  it('applies tick format via tick select', async () => {
    const user = userEvent.setup();
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState()}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Tick format' }));
    await user.click(screen.getByText('32nds'));
    expect(doFormat).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tick', tick: 'TICK32' }));
  });

  it('clears tick format when None selected', async () => {
    const user = userEvent.setup();
    const doFormat = vi.fn();
    render(
      <ModuleFormat
        state={makeFormatterState({
          fmt: { ...makeFormatterState().fmt, valueFormatterTemplate: { kind: 'tick', tick: 'TICK32' } },
        })}
        actions={makeFormatterActions({ doFormat })}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Tick format' }));
    await user.click(screen.getByRole('option', { name: 'None' }));
    expect(doFormat).toHaveBeenCalledWith(undefined);
  });

  it('shows decimals readout dash when no fixed decimals', () => {
    render(
      <ModuleFormat
        state={makeFormatterState()}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByTestId('fmt-decimals-readout')).toHaveTextContent('—');
  });

  it('renders single picker for date column scope selected', () => {
    render(
      <ModuleFormat
        state={makeFormatterState({ pickerDataType: 'date', scope: 'selected' })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByTestId('fmt-picker-toolbar')).toBeInTheDocument();
  });
});
