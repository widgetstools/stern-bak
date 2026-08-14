import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModulePaint } from './ModulePaint';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

vi.mock('../../../customizer/internal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../customizer/internal.js')>();
  return {
    ...actual,
    ColorPickerPopover: ({
      title,
      onChange,
      disabled,
    }: {
      title: string;
      onChange: (c: string | undefined) => void;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange('#ff0000')}
      >
        {title}
      </button>
    ),
    BorderStyleEditor: ({
      onChange,
    }: {
      onChange: (next: { top?: { width: number; color: string; style: string } }) => void;
    }) => (
      <button
        type="button"
        data-testid="mock-border-editor"
        onClick={() => onChange({ top: { width: 1, color: '#000', style: 'solid' } })}
      >
        Apply border
      </button>
    ),
  };
});

describe('ModulePaint', () => {
  it('renders text and fill color triggers', () => {
    render(<ModulePaint state={makeFormatterState()} actions={makeFormatterActions()} />);
    expect(screen.getByRole('button', { name: 'Text color' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill color' })).toBeInTheDocument();
  });

  it('opens border editor popover', async () => {
    render(<ModulePaint state={makeFormatterState()} actions={makeFormatterActions()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cell borders' }));
    await waitFor(() => expect(screen.getByTestId('mock-border-editor')).toBeInTheDocument());
  });

  it('text color stays enabled for header target', () => {
    render(
      <ModulePaint
        state={makeFormatterState({ isHeader: true, disabled: true })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Text color' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fill color' })).toBeDisabled();
  });

  it('setTextColor fires when text color trigger clicked', () => {
    const setTextColor = vi.fn();
    render(
      <ModulePaint
        state={makeFormatterState()}
        actions={makeFormatterActions({ setTextColor })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    expect(setTextColor).toHaveBeenCalledWith('#ff0000');
  });

  it('setBgColor fires when fill color trigger clicked', () => {
    const setBgColor = vi.fn();
    render(
      <ModulePaint
        state={makeFormatterState()}
        actions={makeFormatterActions({ setBgColor })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fill color' }));
    expect(setBgColor).toHaveBeenCalledWith('#ff0000');
  });

  it('applyBordersMap fires from border editor', async () => {
    const applyBordersMap = vi.fn();
    render(
      <ModulePaint
        state={makeFormatterState()}
        actions={makeFormatterActions({ applyBordersMap })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cell borders' }));
    await waitFor(() => expect(screen.getByTestId('mock-border-editor')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-border-editor'));
    expect(applyBordersMap).toHaveBeenCalledWith({
      top: { width: 1, color: '#000', style: 'solid' },
    });
  });

  it('border trigger suppresses default on mouseDown', () => {
    render(<ModulePaint state={makeFormatterState()} actions={makeFormatterActions()} />);
    const trigger = screen.getByRole('button', { name: 'Cell borders' });
    const prevented = fireEvent.mouseDown(trigger);
    expect(prevented).toBe(false);
  });

  it('disables fill and border controls when module disabled', () => {
    render(
      <ModulePaint
        state={makeFormatterState({ disabled: true })}
        actions={makeFormatterActions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fill color' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cell borders' })).toBeDisabled();
  });

  it('popover content suppresses default mouseDown outside inputs', async () => {
    render(<ModulePaint state={makeFormatterState()} actions={makeFormatterActions()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cell borders' }));
    await waitFor(() => expect(screen.getByTestId('mock-border-editor')).toBeInTheDocument());
    const prevented = fireEvent.mouseDown(screen.getByTestId('mock-border-editor'));
    expect(prevented).toBe(false);
  });
});
