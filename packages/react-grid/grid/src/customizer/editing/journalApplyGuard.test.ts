import { afterEach, describe, expect, it } from 'vitest';
import {
  clearJournalApplyGuardRegistry,
  isJournalApplyInProgress,
  withJournalApplyGuard,
} from './journalApplyGuard.js';

describe('journalApplyGuard', () => {
  afterEach(() => {
    clearJournalApplyGuardRegistry();
  });

  it('tracks nested apply depth per grid', async () => {
    expect(isJournalApplyInProgress('g1')).toBe(false);
    await withJournalApplyGuard('g1', async () => {
      expect(isJournalApplyInProgress('g1')).toBe(true);
      await withJournalApplyGuard('g1', async () => {
        expect(isJournalApplyInProgress('g1')).toBe(true);
      });
      expect(isJournalApplyInProgress('g1')).toBe(true);
    });
    expect(isJournalApplyInProgress('g1')).toBe(false);
  });

  it('clears guard when apply throws', async () => {
    await expect(withJournalApplyGuard('g2', async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');
    expect(isJournalApplyInProgress('g2')).toBe(false);
  });
});
