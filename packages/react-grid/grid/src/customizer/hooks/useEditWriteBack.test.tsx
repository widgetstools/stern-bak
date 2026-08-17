/**
 * @vitest-environment jsdom
 *
 * The forwarder this hook registers is where the platform's own failure
 * surface joins the app's optional handler. Before Phase 11 it forwarded
 * `onFailure` and nothing else, so a grid whose consumer supplied no handler —
 * every consumer in this tree — reverted a refused edit with no trace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { EditWriteBack, EditWriteBackFailure, GridPlatform } from '@wellsfargo-starui/core';

const reportEditFailure = vi.fn();
vi.mock('../editing/editFailureToast.js', () => ({
  reportEditFailure: (failure: EditWriteBackFailure) => reportEditFailure(failure),
}));

const registered = new Map<string, { writeBack: EditWriteBack }>();
vi.mock('../editing/editWriteBack.js', () => ({
  registerEditWriteBack: (gridId: string, entry: { writeBack: EditWriteBack } | null) => {
    if (entry) registered.set(gridId, entry);
    else registered.delete(gridId);
  },
}));

const { useEditWriteBack } = await import('./useEditWriteBack.js');

const platform = { gridId: 'g1', data: {} } as unknown as GridPlatform;

const FAILURE: EditWriteBackFailure = {
  submission: { gridId: 'g1', source: 'cell-editor', patches: [] },
  error: new Error('refused'),
  rolledBack: [{ rowId: 'r1', field: 'qty', colId: 'qty', oldValue: 1, newValue: 2 }],
  stuck: [],
};

function Host({ writeBack }: { writeBack: EditWriteBack | null }) {
  useEditWriteBack(platform, writeBack);
  return null;
}

beforeEach(() => {
  registered.clear();
  reportEditFailure.mockClear();
});

afterEach(cleanup);

describe('useEditWriteBack', () => {
  it('surfaces the failure even when the consumer supplied no onFailure', () => {
    render(<Host writeBack={{ submit: vi.fn() }} />);
    registered.get('g1')!.writeBack.onFailure!(FAILURE);

    expect(reportEditFailure).toHaveBeenCalledWith(FAILURE);
  });

  it("still calls the consumer's onFailure — the toast is additional, not instead", () => {
    const onFailure = vi.fn();
    render(<Host writeBack={{ submit: vi.fn(), onFailure }} />);
    registered.get('g1')!.writeBack.onFailure!(FAILURE);

    expect(reportEditFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(FAILURE);
  });

  it("runs the consumer's handler even if the surface throws", () => {
    reportEditFailure.mockImplementationOnce(() => {
      throw new Error('toaster exploded');
    });
    const onFailure = vi.fn();
    render(<Host writeBack={{ submit: vi.fn(), onFailure }} />);

    expect(() => registered.get('g1')!.writeBack.onFailure!(FAILURE)).toThrow();
    expect(onFailure).toHaveBeenCalledWith(FAILURE);
  });

  it('registers nothing at all when the consumer supplied no write-back', () => {
    render(<Host writeBack={null} />);
    expect(registered.has('g1')).toBe(false);
  });
});
