/**
 * Visibility predicate tests (Decision 6 / Session 4).
 *
 * Pins the small `isVisible` rule so future schema or scope changes
 * (notably Session 8's impersonation flip) leave the predicate
 * verifiably unchanged.
 */

import { describe, it, expect } from 'vitest';
import type { AppConfigRow } from './types';
import { isVisible, type VisibilityContext } from './visibility';

function row(over: Partial<AppConfigRow>): AppConfigRow {
  return {
    configId: over.configId ?? 'cfg',
    appId: over.appId ?? 'A',
    userId: over.userId ?? 'alice',
    isPublic: over.isPublic,
    displayText: 'row',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    isTemplate: false,
    payload: {},
    createdBy: over.userId ?? 'alice',
    updatedBy: over.userId ?? 'alice',
    creationTime: '2026-05-01T00:00:00.000Z',
    updatedTime: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

const ctx = (over: Partial<VisibilityContext> = {}): VisibilityContext => ({
  appId: 'A',
  effectiveUserId: 'alice',
  ...over,
});

describe('isVisible — Decision 6 visibility matrix', () => {
  // Mirrors the table in
  // docs/plans/plan-2026-05-07/config-manager-redesign-sessions.md
  // (Session 4 → step 4.5).

  it('public row, same app, same user → visible', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: true }),
        ctx({ appId: 'A', effectiveUserId: 'alice' }),
      ),
    ).toBe(true);
  });

  it('public row, same app, different user → visible (public wins)', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: true }),
        ctx({ appId: 'A', effectiveUserId: 'bob' }),
      ),
    ).toBe(true);
  });

  it('private row, same app, owner is the effective user → visible', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: false }),
        ctx({ appId: 'A', effectiveUserId: 'alice' }),
      ),
    ).toBe(true);
  });

  it('private row, same app, different effective user → hidden', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: false }),
        ctx({ appId: 'A', effectiveUserId: 'bob' }),
      ),
    ).toBe(false);
  });

  it('public row from a different app → hidden (app scope wins)', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: true }),
        ctx({ appId: 'B', effectiveUserId: 'alice' }),
      ),
    ).toBe(false);
  });

  // ─── Edge cases ──────────────────────────────────────────────────

  it('isPublic === undefined is treated as private (caller stamps the value)', () => {
    // Until Session 1's Dexie upgrade runs on a row, `isPublic` may be
    // missing. The migration backfills it to true; any row that
    // somehow reaches the predicate without going through the upgrade
    // is treated as private (safer default).
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: undefined }),
        ctx({ appId: 'A', effectiveUserId: 'bob' }),
      ),
    ).toBe(false);
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: undefined }),
        ctx({ appId: 'A', effectiveUserId: 'alice' }),
      ),
    ).toBe(true);
  });

  it('private row from a different app → hidden (app check happens first)', () => {
    expect(
      isVisible(
        row({ appId: 'A', userId: 'alice', isPublic: false }),
        ctx({ appId: 'B', effectiveUserId: 'alice' }),
      ),
    ).toBe(false);
  });
});
