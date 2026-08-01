/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RuleMetaStrip } from './RuleMetaStrip';

function commitIconInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('RuleMetaStrip', () => {
  it('renders summary chips and toggles enabled state', () => {
    const setDraft = vi.fn();
    render(
      <RuleMetaStrip
        ruleId="r1"
        enabled
        scopeType="cell"
        priority={5}
        flash={undefined}
        appliedCount={3}
        setDraft={setDraft}
      />,
    );

    expect(screen.getByText('ACTIVE')).toBeTruthy();
    expect(screen.getByText('3 ROWS')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch'));
    expect(setDraft).toHaveBeenCalledWith({ enabled: false });
  });

  it('changes scope and clamps priority on commit', async () => {
    const user = userEvent.setup();
    const setDraft = vi.fn();
    render(
      <RuleMetaStrip
        ruleId="r1"
        enabled
        scopeType="cell"
        priority={5}
        flash={{ enabled: true, target: 'cells', mode: 'oneShot', color: 'amber' }}
        appliedCount={0}
        setDraft={setDraft}
      />,
    );

    await user.click(screen.getByTestId('cs-rule-scope-r1'));
    await user.click(await screen.findByRole('option', { name: /^ROW$/ }));
    expect(setDraft).toHaveBeenCalledWith({
      scope: { type: 'row' },
      flash: expect.objectContaining({ target: 'row' }),
    });

    commitIconInput(screen.getByTestId('cs-rule-priority-r1'), '150');
    expect(setDraft).toHaveBeenCalledWith({ priority: 100 });
  });
});
