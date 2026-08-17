/**
 * The `historicalDateAppDataRef` contract. Both containers depend on these
 * two functions agreeing, and the ref parsing used to exist as three inline
 * copies inside MarketsGridContainer.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  readHistoricalDateFromAppData,
  writeHistoricalDateToAppData,
} from './historicalDateAppData.js';

function pastIso(daysAgo = 7): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('readHistoricalDateFromAppData', () => {
  it('reads the entry the ref names', () => {
    const iso = pastIso();
    const get = vi.fn(() => iso);
    expect(readHistoricalDateFromAppData('positions.asOfDate', { get })).toBe(iso);
    expect(get).toHaveBeenCalledWith('positions', 'asOfDate');
  });

  it('splits on the FIRST dot, so a dotted key survives', () => {
    const iso = pastIso();
    const get = vi.fn(() => iso);
    readHistoricalDateFromAppData('positions.book.asOfDate', { get });
    expect(get).toHaveBeenCalledWith('positions', 'book.asOfDate');
  });

  // A stale "today" in AppData must not restore a grid into historical mode
  // pointed at live data — the banner would claim an as-of view of now.
  it('refuses a value that is not a PAST date', () => {
    expect(readHistoricalDateFromAppData('p.k', { get: () => todayIso() })).toBeNull();
    expect(readHistoricalDateFromAppData('p.k', { get: () => '2999-01-01' })).toBeNull();
    expect(readHistoricalDateFromAppData('p.k', { get: () => 'not-a-date' })).toBeNull();
    expect(readHistoricalDateFromAppData('p.k', { get: () => 42 })).toBeNull();
    expect(readHistoricalDateFromAppData('p.k', { get: () => undefined })).toBeNull();
  });

  it('returns null for an absent or malformed ref without touching the store', () => {
    const get = vi.fn(() => pastIso());
    expect(readHistoricalDateFromAppData(undefined, { get })).toBeNull();
    expect(readHistoricalDateFromAppData('', { get })).toBeNull();
    expect(readHistoricalDateFromAppData('noDot', { get })).toBeNull();
    expect(readHistoricalDateFromAppData('.leadingDot', { get })).toBeNull();
    expect(readHistoricalDateFromAppData('trailingDot.', { get })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe('writeHistoricalDateToAppData', () => {
  it('writes and resolves true', async () => {
    const set = vi.fn();
    await expect(
      writeHistoricalDateToAppData('positions.asOfDate', { set }, '2026-01-02'),
    ).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith('positions', 'asOfDate', '2026-01-02');
  });

  // "Nowhere to write" is not a failure — a host with no ref configured is a
  // supported configuration. Only a REJECTING store is a failure, and the
  // reload path distinguishes them.
  it('resolves false without writing when there is no ref', async () => {
    const set = vi.fn();
    await expect(writeHistoricalDateToAppData(undefined, { set }, '2026-01-02')).resolves.toBe(false);
    await expect(writeHistoricalDateToAppData('noDot', { set }, '2026-01-02')).resolves.toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('propagates a failing write', async () => {
    const boom = new Error('config service down');
    await expect(
      writeHistoricalDateToAppData('p.k', { set: () => Promise.reject(boom) }, '2026-01-02'),
    ).rejects.toBe(boom);
  });
});
