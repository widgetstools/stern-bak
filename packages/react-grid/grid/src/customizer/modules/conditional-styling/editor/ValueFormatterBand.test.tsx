/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ValueFormatterBand } from './ValueFormatterBand';

vi.mock('../../../ui/FormatterPicker', () => ({
  FormatterPicker: ({
    onChange,
    'data-testid': testId,
  }: {
    onChange: (next: unknown) => void;
    'data-testid'?: string;
  }) => (
    <button
      type="button"
      data-testid={`${testId}-mock-pick`}
      onClick={() => onChange({ kind: 'excelFormat', format: '#,##0.00' })}
    >
      pick
    </button>
  ),
  inferPickerDataType: (t: string | undefined) => t ?? 'number',
}));

describe('ValueFormatterBand', () => {
  it('returns null for non-cell scope', () => {
    const { container } = render(
      <ValueFormatterBand
        ruleId="rule-1"
        scope={{ type: 'row' }}
        valueFormatter={undefined}
        cellDataTypeForColumn={() => 'number'}
        setDraft={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders formatter picker for a single target column', () => {
    render(
      <ValueFormatterBand
        ruleId="rule-1"
        scope={{ type: 'cell', columns: ['price'] }}
        valueFormatter={undefined}
        cellDataTypeForColumn={() => 'number'}
        setDraft={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cs-rule-value-formatter-rule-1-mock-pick')).toBeTruthy();
  });

  it('shows guidance when multiple columns are selected', () => {
    render(
      <ValueFormatterBand
        ruleId="rule-1"
        scope={{ type: 'cell', columns: ['price', 'qty'] }}
        valueFormatter={undefined}
        cellDataTypeForColumn={() => 'number'}
        setDraft={vi.fn()}
      />,
    );
    expect(screen.getByText(/Select exactly ONE target column/i)).toBeTruthy();
  });

  it('forwards formatter changes through setDraft', () => {
    const setDraft = vi.fn();
    render(
      <ValueFormatterBand
        ruleId="rule-1"
        scope={{ type: 'cell', columns: ['price'] }}
        valueFormatter={undefined}
        cellDataTypeForColumn={() => 'text'}
        setDraft={setDraft}
      />,
    );
    fireEvent.click(screen.getByTestId('cs-rule-value-formatter-rule-1-mock-pick'));
    expect(setDraft).toHaveBeenCalledWith({
      valueFormatter: { kind: 'excelFormat', format: '#,##0.00' },
    });
  });
});
