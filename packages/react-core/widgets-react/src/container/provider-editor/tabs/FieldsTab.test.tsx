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
