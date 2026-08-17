/**
 * @vitest-environment jsdom
 *
 * The copy a refused write produces, and the fact that it is always two
 * messages rather than one. `stuck` is the case worth protecting: it means the
 * grid is showing a value the server refused and could not take back, and it
 * is reachable under SSRM whenever the row's block was evicted between the
 * edit and the answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CellPatch, EditWriteBackFailure } from '@wellsfargo-starui/core';

const errorToast = vi.fn();
vi.mock('@wellsfargo-starui/react', () => ({
  sonnerToast: { error: (...args: unknown[]) => errorToast(...args) },
}));

const { describeEditFailure, reportEditFailure } = await import('./editFailureToast.js');

function patch(field: string, rowId = 'r1'): CellPatch {
  return { rowId, field, colId: field, oldValue: 1, newValue: 2 };
}

function failure(over: Partial<EditWriteBackFailure> = {}): EditWriteBackFailure {
  return {
    submission: { gridId: 'g1', source: 'cell-editor', patches: [] },
    error: new Error('rejected by risk service'),
    rolledBack: [],
    stuck: [],
    ...over,
  };
}

beforeEach(() => errorToast.mockClear());

describe('describeEditFailure', () => {
  it('says "reverted" when everything went back, and nothing about stuck', () => {
    const { reverted, stuck } = describeEditFailure(
      failure({ rolledBack: [patch('price')] }),
    );
    expect(stuck).toBeNull();
    expect(reverted?.title).toBe('Edit rejected — reverted');
    expect(reverted?.description).toContain('1 cell in price');
    expect(reverted?.description).toContain('previous value');
    // A reverted edit is annoying, not dangerous — it expires on its own.
    expect(reverted?.durationMs).toBeGreaterThan(0);
  });

  it('says "NOT reverted" for stuck cells, and never lets that one expire', () => {
    const { reverted, stuck } = describeEditFailure(failure({ stuck: [patch('bid')] }));
    expect(reverted).toBeNull();
    expect(stuck?.title).toBe('Edit rejected — NOT reverted');
    expect(stuck?.description).toContain('still show the rejected value');
    expect(stuck?.description).toContain('Refresh');
    expect(stuck?.durationMs).toBeNull();
  });

  it('keeps the two apart when one submission produces both', () => {
    const { reverted, stuck } = describeEditFailure(
      failure({ rolledBack: [patch('price')], stuck: [patch('bid'), patch('ask')] }),
    );
    expect(reverted?.description).toContain('1 cell in price');
    expect(stuck?.description).toContain('2 cells in bid and ask');
    expect(reverted!.title).not.toBe(stuck!.title);
  });

  it('lists up to three fields by name and summarises the rest', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((f) => patch(f));
    const { stuck } = describeEditFailure(failure({ stuck: many }));
    expect(stuck?.description).toContain('5 cells in a, b, c and 2 more');
  });

  it('counts cells, not distinct fields', () => {
    const { reverted } = describeEditFailure(
      failure({ rolledBack: [patch('price', 'r1'), patch('price', 'r2')] }),
    );
    expect(reverted?.description).toContain('2 cells in price');
  });

  it("carries the service's own reason when it gave one", () => {
    const { reverted } = describeEditFailure(
      failure({ rolledBack: [patch('price')], error: new Error('limit breached') }),
    );
    expect(reverted?.description).toContain('limit breached');
  });

  it('truncates a runaway reason rather than pasting it into a toast', () => {
    const { stuck } = describeEditFailure(
      failure({ stuck: [patch('price')], error: new Error('x'.repeat(500)) }),
    );
    expect(stuck!.description.length).toBeLessThan(300);
    expect(stuck?.description).toContain('…');
  });

  it('reads a thrown string, and stays quiet about a thrown object', () => {
    const fromString = describeEditFailure(
      failure({ stuck: [patch('price')], error: 'service unavailable' }),
    );
    expect(fromString.stuck?.description).toContain('service unavailable');

    const fromObject = describeEditFailure(
      failure({ stuck: [patch('price')], error: { code: 500 } }),
    );
    expect(fromObject.stuck?.description).not.toContain('500');
    expect(fromObject.stuck?.description).toContain('Refresh');
  });
});

describe('reportEditFailure', () => {
  it('raises one toast per non-empty set, not one combined string', () => {
    reportEditFailure(failure({ rolledBack: [patch('price')], stuck: [patch('bid')] }));
    expect(errorToast).toHaveBeenCalledTimes(2);
    const titles = errorToast.mock.calls.map((c) => c[0]);
    expect(titles).toEqual(['Edit rejected — reverted', 'Edit rejected — NOT reverted']);
  });

  it('gives the stuck toast an infinite duration so it cannot scroll past', () => {
    reportEditFailure(failure({ stuck: [patch('bid')] }));
    expect(errorToast).toHaveBeenCalledTimes(1);
    expect(errorToast.mock.calls[0][1]).toMatchObject({ duration: Infinity });
  });

  it('raises nothing when the revert left nothing to report', () => {
    reportEditFailure(failure());
    expect(errorToast).not.toHaveBeenCalled();
  });
});
