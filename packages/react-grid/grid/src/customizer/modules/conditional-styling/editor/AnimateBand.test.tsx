/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimateBand } from './AnimateBand';

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('AnimateBand', () => {
  it('renders disabled by default and toggles animation on', () => {
    const setDraft = vi.fn();
    render(<AnimateBand ruleId="r1" animation={undefined} setDraft={setDraft} />);
    expect(screen.getByTestId('cs-rule-animate-enabled-r1')).toHaveAttribute('data-state', 'unchecked');

    fireEvent.click(screen.getByTestId('cs-rule-animate-enabled-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      animation: expect.objectContaining({ enabled: true, kind: 'spin' }),
    });
  });

  it('shows style pills and commits kind + duration when enabled', () => {
    const setDraft = vi.fn();
    render(
      <AnimateBand
        ruleId="r1"
        animation={{ enabled: true, kind: 'spin', durationMs: 1000 }}
        setDraft={setDraft}
      />,
    );

    fireEvent.click(screen.getByTestId('cs-rule-animate-kind-pulse-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      animation: expect.objectContaining({ enabled: true, kind: 'pulse', durationMs: 1000 }),
    });

    commitIconInput(screen.getByTestId('cs-rule-animate-duration-r1'), '500');
    expect(setDraft).toHaveBeenCalledWith({
      animation: expect.objectContaining({ durationMs: 500 }),
    });
  });

  it('turning animation off preserves prior config envelope', () => {
    const setDraft = vi.fn();
    const animation = { enabled: true, kind: 'spin-reverse' as const, durationMs: 800 };
    render(<AnimateBand ruleId="r1" animation={animation} setDraft={setDraft} />);

    fireEvent.click(screen.getByTestId('cs-rule-animate-enabled-r1'));
    expect(setDraft).toHaveBeenCalledWith({
      animation: { ...animation, enabled: false },
    });
  });

  it('ignores invalid duration and clears blank input', () => {
    const setDraft = vi.fn();
    render(
      <AnimateBand
        ruleId="r1"
        animation={{ enabled: true, kind: 'spin-reverse', durationMs: 1000 }}
        setDraft={setDraft}
      />,
    );

    commitIconInput(screen.getByTestId('cs-rule-animate-duration-r1'), '   ');
    expect(setDraft).toHaveBeenCalledWith({
      animation: expect.objectContaining({ durationMs: undefined }),
    });

    setDraft.mockClear();
    commitIconInput(screen.getByTestId('cs-rule-animate-duration-r1'), 'abc');
    expect(setDraft).not.toHaveBeenCalled();

    setDraft.mockClear();
    commitIconInput(screen.getByTestId('cs-rule-animate-duration-r1'), '50');
    expect(setDraft).toHaveBeenCalledWith({
      animation: expect.objectContaining({ durationMs: 100 }),
    });
  });
});
