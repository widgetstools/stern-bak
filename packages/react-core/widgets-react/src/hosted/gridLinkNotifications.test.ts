import { describe, it, expect } from 'vitest';
import type { GridLinkSelectionContext } from './gridContextLink';
import {
  summarizeCriteria,
  summarizeLinkContext,
  buildSelectionNotification,
  buildAckNotification,
} from './gridLinkNotifications';

const ctx = (over: Partial<GridLinkSelectionContext>): GridLinkSelectionContext => ({
  type: 'starui.gridSelection',
  criteria: {},
  ...over,
});

describe('summarizeCriteria', () => {
  it('renders a single field/value as "field = value"', () => {
    expect(summarizeCriteria({ positionId: ['ABC123'] })).toBe('positionId = ABC123');
  });

  it('renders multiple values as a set and joins fields with ·', () => {
    expect(summarizeCriteria({ positionId: ['A', 'B'], book: ['X'] })).toBe(
      'positionId ∈ {A, B} · book = X',
    );
  });

  it('ignores empty value lists and returns "" for nothing', () => {
    expect(summarizeCriteria({ positionId: [] })).toBe('');
    expect(summarizeCriteria(undefined)).toBe('');
  });
});

describe('summarizeLinkContext', () => {
  it('prefers criteria, falls back to rowIds', () => {
    expect(summarizeLinkContext(ctx({ criteria: { positionId: ['A'] } }))).toBe('positionId = A');
    expect(summarizeLinkContext(ctx({ criteria: {}, rowIds: ['A'] }))).toBe('A');
    expect(summarizeLinkContext(ctx({ criteria: {}, rowIds: ['A', 'B', 'C', 'D'] }))).toBe(
      '4 rows (A, B, C, …)',
    );
  });
});

describe('buildSelectionNotification', () => {
  it('produces a publish notification carrying the key column + value', () => {
    const n = buildSelectionNotification(ctx({ source: 'grid-1', criteria: { positionId: ['ABC123'] } }));
    expect(n).not.toBeNull();
    expect(n!.title).toBe('Linked selection sent');
    expect(n!.body).toContain('positionId = ABC123');
    expect(n!.category).toBe('info');
    expect(n!.customData).toMatchObject({ kind: 'gridLink.selection', source: 'grid-1' });
  });

  it('shows the joined channel, and flags when there is none', () => {
    const withCh = buildSelectionNotification(ctx({ criteria: { positionId: ['A'] }, channel: 'purple' }));
    expect(withCh!.body).toContain('`purple`');
    expect(withCh!.customData).toMatchObject({ channel: 'purple' });
    const noCh = buildSelectionNotification(ctx({ criteria: { positionId: ['A'] } }));
    expect(noCh!.body).toContain('no channel');
  });

  it('returns null when the selection is empty (deselect)', () => {
    expect(buildSelectionNotification(ctx({ criteria: {} }))).toBeNull();
  });
});

describe('buildAckNotification', () => {
  it('acknowledges receipt, naming the source peer and the key column + value', () => {
    const n = buildAckNotification(
      ctx({ source: 'grid-1', criteria: { positionId: ['ABC123'] } }),
      { instanceId: 'grid-2' },
    );
    expect(n).not.toBeNull();
    expect(n!.title).toBe('Linked selection received');
    expect(n!.body).toContain('positionId = ABC123');
    expect(n!.body).toContain('grid-1');
    expect(n!.customData).toMatchObject({ kind: 'gridLink.ack', from: 'grid-1', to: 'grid-2' });
  });

  it('returns null when the received selection is empty', () => {
    expect(buildAckNotification(ctx({ criteria: {} }), { instanceId: 'grid-2' })).toBeNull();
  });
});
