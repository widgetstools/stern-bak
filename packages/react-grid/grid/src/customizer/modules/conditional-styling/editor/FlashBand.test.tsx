/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlashBand } from './FlashBand';

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('FlashBand', () => {
  it('enables flash with default cell target in cell scope', () => {
    const setDraft = vi.fn();
    render(
      <FlashBand
        ruleId="r1"
        flash={undefined}
        activeDurationMs={undefined}
        scopeType="cell"
        setDraft={setDraft}
      />,
    );

    fireEvent.click(screen.getByTestId('cs-rule-flash-enabled-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      flash: expect.objectContaining({ enabled: true, target: 'cells' }),
    });
  });

  it('cell scope exposes target pills and mode/colour/duration controls when enabled', () => {
    const setDraft = vi.fn();
    render(
      <FlashBand
        ruleId="r1"
        flash={{ enabled: true, target: 'cells', mode: 'oneShot', color: 'amber' }}
        activeDurationMs={undefined}
        scopeType="cell"
        setDraft={setDraft}
      />,
    );

    fireEvent.click(screen.getByTestId('cs-rule-flash-target-headers-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      flash: expect.objectContaining({ target: 'headers' }),
    });

    fireEvent.click(screen.getByTestId('cs-rule-flash-mode-pulse-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      flash: expect.objectContaining({ mode: 'pulse' }),
    });

    fireEvent.click(screen.getByTestId('cs-rule-flash-color-emerald-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      flash: expect.objectContaining({ color: 'emerald' }),
    });

    commitIconInput(screen.getByTestId('cs-rule-flash-duration-r1'), '900');
    expect(setDraft).toHaveBeenCalledWith({
      flash: expect.objectContaining({ durationMs: 900 }),
    });
  });

  it('row scope labels entire row and omits target pills', () => {
    const setDraft = vi.fn();
    render(
      <FlashBand
        ruleId="r1"
        flash={{ enabled: true, target: 'row', mode: 'oneShot', color: 'sky' }}
        activeDurationMs={1200}
        scopeType="row"
        setDraft={setDraft}
      />,
    );

    expect(screen.getByText('ENTIRE ROW')).toBeTruthy();
    expect(screen.queryByTestId('cs-rule-flash-target-cells-r1')).toBeNull();

    commitIconInput(screen.getByTestId('cs-rule-style-window-ms-r1'), '2500');
    expect(setDraft).toHaveBeenCalledWith({ activeDurationMs: 2500 });
  });
});
