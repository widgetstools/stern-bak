import { describe, it, expect } from 'vitest';
import { matchFieldToCatalog, normalizeToken, soundex } from './matchFieldToCatalog.js';
import { buildAutoFormatPlan } from './buildAutoFormatPlan.js';

describe('normalizeToken', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(normalizeToken('unrealizedPnL')).toBe('unrealizedpnl');
    expect(normalizeToken('rating.moody')).toBe('ratingmoody');
    expect(normalizeToken('day_chg_pct')).toBe('daychgpct');
  });
});

describe('soundex', () => {
  it('encodes the canonical Russell examples', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(soundex('Ashcraft')).toBe('A261');
    expect(soundex('Tymczak')).toBe('T522');
    expect(soundex('Pfister')).toBe('P236');
  });

  it('returns empty for a letter-free token', () => {
    expect(soundex('123')).toBe('');
  });

  it('collapses common spelling variants to the same code', () => {
    expect(soundex('yield')).toBe(soundex('yeild'));
    expect(soundex('Smith')).toBe(soundex('Smyth'));
  });
});

describe('matchFieldToCatalog — nested fields match on the last segment', () => {
  it('uses the leaf for a dotted path (position.marketValue → notional/M)', () => {
    const r = matchFieldToCatalog('position.marketValue', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '#,##0.00,,"M"' });
  });

  it('ignores parent segments (trade.execution.bidPrice → price suffix)', () => {
    const r = matchFieldToCatalog('trade.execution.bidPrice', undefined, 'number');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
  });
});

describe('matchFieldToCatalog — phonetic (Soundex) fallback', () => {
  it('matches a misspelled yield via Soundex', () => {
    const r = matchFieldToCatalog('yeild', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 3, thousands: false } });
  });

  it('does not phonetically match tokens shorter than the minimum length', () => {
    // "sp" is an exact rating alias, but a 2-char unknown token must not
    // phonetically latch onto it.
    expect(matchFieldToCatalog('id', undefined, 'text')).toBeNull();
  });

  it('exact alias still outranks a phonetic near-miss', () => {
    const r = matchFieldToCatalog('symbol', undefined, 'text');
    expect(r?.typography).toEqual({ bold: true });
  });

  it('does NOT phonetically match a text column (desk → daychg Soundex collision)', () => {
    // `desk` and the `change` entry's `daychg` alias both encode to D200.
    // A string field must stay left-aligned / untouched, never right-aligned.
    expect(soundex('desk')).toBe(soundex('daychg'));
    expect(matchFieldToCatalog('desk', undefined, 'text')).toBeNull();
    expect(matchFieldToCatalog('desk', undefined, undefined)).toBeNull();
  });

  it('still phonetically matches the same collision token when the column IS numeric', () => {
    // Gating is by data type, not by token — a numeric `desk` would still
    // resolve (here to the sign-coloured change format), confirming the
    // restriction is purely the text-column guard.
    const r = matchFieldToCatalog('desk', undefined, 'number');
    expect(r?.alignment).toBe('right');
  });
});

describe('matchFieldToCatalog — P&L aliases (case / abbreviation variants)', () => {
  for (const field of ['unrealizedPnL', 'unrealizedPnl', 'unrealPnl', 'dailyPnL', 'mtdPnl', 'pnl']) {
    it(`maps ${field} to a sign-coloured K-magnitude excelFormat, right-aligned`, () => {
      const r = matchFieldToCatalog(field, undefined, 'number');
      expect(r?.alignment).toBe('right');
      // Native sign colouring rides on the value formatter's [Green]/[Red]
      // tags; the trailing comma scales to thousands ("K") — no cell renderer.
      expect(r?.valueFormatterTemplate).toEqual({
        kind: 'excelFormat',
        format: '[Green]#,##0.0,"K";[Red]-#,##0.0,"K";0',
      });
    });
  }
});

describe('matchFieldToCatalog — suffix (last element) matching', () => {
  it('matches *Price via the price suffix', () => {
    const r = matchFieldToCatalog('bidPrice', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
  });

  it('matches a dotted leaf (rating.moody) to centred (no renderer)', () => {
    const r = matchFieldToCatalog('rating.moody', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });

  it('matches *Date to a localised date format', () => {
    const r = matchFieldToCatalog('settlementDate', undefined, 'date');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'date' });
  });

  it('matches *Status to centred (no renderer)', () => {
    const r = matchFieldToCatalog('tradeStatus', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });

  it('matches symbol to bold typography (no renderer)', () => {
    const r = matchFieldToCatalog('symbol', undefined, 'text');
    expect(r?.typography).toEqual({ bold: true });
    expect(r?.alignment).toBe('left');
  });
});

describe('matchFieldToCatalog — exact alias outranks suffix', () => {
  it('rfqStatus matches the rfq-status entry (centred), not generic', () => {
    const r = matchFieldToCatalog('rfqStatus', undefined, 'text');
    expect(r?.alignment).toBe('center');
    expect(r?.valueFormatterTemplate).toBeUndefined();
  });
});

describe('matchFieldToCatalog — generic fallback by data type', () => {
  it('unknown numeric field right-aligns with grouped 2dp', () => {
    const r = matchFieldToCatalog('someUnknownMetric', undefined, 'number');
    expect(r?.alignment).toBe('right');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 2, thousands: true } });
  });

  it('unknown date field gets a localised date format', () => {
    const r = matchFieldToCatalog('wheneverField', undefined, 'dateString');
    expect(r?.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'date' });
  });

  it('boolean field centres', () => {
    expect(matchFieldToCatalog('isActive', undefined, 'boolean')).toEqual({ alignment: 'center' });
  });

  it('plain untyped string field is left untouched', () => {
    expect(matchFieldToCatalog('freeText', undefined, 'text')).toBeNull();
  });
});

describe('buildAutoFormatPlan', () => {
  it('keys results by colId and skips untouchable columns', () => {
    const plan = buildAutoFormatPlan([
      { colId: 'bidPrice', field: 'bidPrice', cellDataType: 'number' },
      { colId: 'note', field: 'note', cellDataType: 'text' },
      { colId: 'rating.moody', field: 'rating.moody', cellDataType: 'text' },
    ]);
    expect(Object.keys(plan).sort()).toEqual(['bidPrice', 'rating.moody']);
    expect(plan['bidPrice'].alignment).toBe('right');
    expect(plan['rating.moody'].alignment).toBe('center');
  });

  it('falls back to colId when field is absent', () => {
    const plan = buildAutoFormatPlan([{ colId: 'marketValue', cellDataType: 'number' }]);
    // marketValue is a notional → millions ("M") magnitude scale.
    expect(plan['marketValue'].valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '#,##0.00,,"M"' });
  });
});
