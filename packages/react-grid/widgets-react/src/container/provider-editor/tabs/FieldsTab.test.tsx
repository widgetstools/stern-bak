/**
 * FieldsTab — selection persists across parent re-renders.
 *
 * Regression: when EditorForm sourced `selectedColumnFields` from the
 * committed cfg (not the draft buffer), every parent re-render reset
 * FieldsTab's `selected` Set to the committed list — checkbox clicks
 * appeared to do nothing because the local state flipped back as soon
 * as the parent re-rendered with an unchanged selectedColumnFields.
 */
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FieldNode, ColumnDefinition } from '@wellsfargo-starui/shared-types';
import type { ProviderConfig } from '@wellsfargo-starui/shared-types';
import { FieldsTab, buildColumns } from './FieldsTab.js';

const FIELDS: FieldNode[] = [
  { path: 'price', name: 'price', type: 'number', nullable: false },
  { path: 'symbol', name: 'symbol', type: 'string', nullable: false },
];

const SAMPLE_CFG: ProviderConfig = {
  providerType: 'stomp',
  brokerUrl: 'ws://x',
  destination: '/topic/test',
  columnDefinitions: [],
} as unknown as ProviderConfig;

function Harness({ onCols }: { onCols: (cols: ColumnDefinition[]) => void }) {
  // Mirrors EditorForm: a draft buffer sourced from `pending` when
  // present, falling back to a committed list (here: empty).
  const [pending, setPending] = useState<ColumnDefinition[] | null>(null);
  const selectedFields = (pending ?? []).map((c) => c.field);
  return (
    <FieldsTab
      cfg={SAMPLE_CFG}
      inferredFields={FIELDS}
      inferenceSummary={{ rowsFetched: 10, rowsUsed: 10, fieldsDetected: 2 }}
      inferring={false}
      inferenceError={null}
      sampleSize={200}
      onSampleSizeChange={() => {}}
      onInfer={() => {}}
      onColumnsChange={(cols) => {
        setPending(cols);
        onCols(cols);
      }}
      selectedColumnFields={selectedFields}
    />
  );
}

describe('buildColumns — inferred type → cellDataType', () => {
  const TREE: FieldNode[] = [
    { path: 'qty', name: 'qty', type: 'number', nullable: false },
    { path: 'active', name: 'active', type: 'boolean', nullable: false },
    { path: 'name', name: 'name', type: 'string', nullable: false },
    { path: 'asOfDate', name: 'asOfDate', type: 'date', nullable: false },
  ];

  it("maps an inferred date field to 'dateString' (not 'date')", () => {
    const cols = buildColumns(TREE, ['asOfDate']);
    expect(cols[0].cellDataType).toBe('dateString');
  });

  it('preserves number / boolean / object and defaults the rest to text', () => {
    const cols = buildColumns(TREE, ['qty', 'active', 'name']);
    expect(cols.map((c) => c.cellDataType)).toEqual(['number', 'boolean', 'text']);
  });
});

describe('FieldsTab — checkbox selection persists', () => {
  it('keeps a clicked field selected after the parent re-renders', () => {
    const onCols = vi.fn<(cols: ColumnDefinition[]) => void>();
    render(<Harness onCols={onCols} />);

    const priceRow = screen.getByText('price').closest('div')!;
    const cb = priceRow.querySelector('button[role="checkbox"]') as HTMLElement;
    expect(cb).toBeTruthy();
    expect(cb.getAttribute('data-state')).toBe('unchecked');

    fireEvent.click(cb);

    // Must have committed exactly one column for `price`.
    const lastCall = onCols.mock.calls.at(-1)?.[0] ?? [];
    expect(lastCall.map((c) => c.field)).toEqual(['price']);

    // Critically, after the parent re-renders the checkbox stays checked
    // (was the bug: selectedColumnFields source reverted to the
    // committed cfg, so the local Set was reset to empty).
    const cbAfter = priceRow.querySelector('button[role="checkbox"]') as HTMLElement;
    expect(cbAfter.getAttribute('data-state')).toBe('checked');
  });
});

describe('FieldsTab — infer UI', () => {
  it('shows inference errors and triggers infer', () => {
    const onInfer = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={[]}
        inferenceSummary={null}
        inferring={false}
        inferenceError="probe failed"
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={onInfer}
        onColumnsChange={() => {}}
        selectedColumnFields={[]}
      />,
    );
    expect(screen.getByText('probe failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Infer Fields/i }));
    expect(onInfer).toHaveBeenCalled();
  });

  it('filters fields via search and supports select-all', () => {
    const onCols = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={FIELDS}
        inferenceSummary={{ rowsFetched: 10, rowsUsed: 10, fieldsDetected: 2 }}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={onCols}
        selectedColumnFields={[]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search fields…'), { target: { value: 'sym' } });
    expect(screen.getByText('symbol')).toBeInTheDocument();
    expect(screen.queryByText('price')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select All'));
    expect(onCols).toHaveBeenCalled();
  });

  it('shows the empty inference state and changes sample size', async () => {
    const user = userEvent.setup();
    const onInfer = vi.fn();
    const onSampleSizeChange = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={[]}
        inferenceSummary={null}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={onSampleSizeChange}
        onInfer={onInfer}
        onColumnsChange={() => {}}
        selectedColumnFields={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /Infer Fields/i })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: '500 rows' }));
    expect(onSampleSizeChange).toHaveBeenCalledWith(500);
  });

  it('deselects visible leaves when select-all is cleared', () => {
    const onCols = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={FIELDS}
        inferenceSummary={{ rowsFetched: 10, rowsUsed: 10, fieldsDetected: 2 }}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={onCols}
        selectedColumnFields={['price', 'symbol']}
      />,
    );
    fireEvent.click(screen.getByLabelText('Select All'));
    expect(onCols).toHaveBeenCalledWith([]);
  });

  it('renders nested field trees and toggles a parent path only', () => {
    const nested: FieldNode[] = [
      {
        path: 'root',
        name: 'root',
        type: 'object',
        nullable: false,
        children: [{ path: 'root.leaf', name: 'leaf', type: 'string', nullable: false }],
      },
    ];
    const onCols = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={nested}
        inferenceSummary={{ rowsFetched: 1, rowsUsed: 1, fieldsDetected: 1 }}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={onCols}
        selectedColumnFields={[]}
      />,
    );
    const leafRow = screen.getByText('leaf').closest('div')!;
    fireEvent.click(leafRow.querySelector('button[role="checkbox"]')!);
    expect(onCols).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ field: 'root.leaf' })]),
    );
  });

  it('shows inferring state in the empty panel', () => {
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={[]}
        inferenceSummary={null}
        inferring
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={() => {}}
        selectedColumnFields={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /Inferring/i })).toBeDisabled();
  });

  it('windowing activates for large field trees', () => {
    const many: FieldNode[] = Array.from({ length: 120 }, (_, i) => ({
      path: `field${i}`,
      name: `field${i}`,
      type: 'string',
      nullable: false,
    }));
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={many}
        inferenceSummary={{ rowsFetched: 120, rowsUsed: 120, fieldsDetected: 120 }}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={() => {}}
        selectedColumnFields={[]}
      />,
    );
    expect(screen.getByText('field0')).toBeInTheDocument();
  });

  it('deselects only filtered leaves when select-all is cleared under search', () => {
    const onCols = vi.fn();
    render(
      <FieldsTab
        cfg={SAMPLE_CFG}
        inferredFields={FIELDS}
        inferenceSummary={{ rowsFetched: 10, rowsUsed: 10, fieldsDetected: 2 }}
        inferring={false}
        inferenceError={null}
        sampleSize={200}
        onSampleSizeChange={() => {}}
        onInfer={() => {}}
        onColumnsChange={onCols}
        selectedColumnFields={['price', 'symbol']}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search fields…'), { target: { value: 'sym' } });
    fireEvent.click(screen.getByLabelText('Select All'));
    expect(onCols).toHaveBeenCalledWith([expect.objectContaining({ field: 'price' })]);
  });
});
