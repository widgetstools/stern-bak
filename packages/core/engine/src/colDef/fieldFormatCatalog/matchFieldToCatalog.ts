/**
 * matchFieldToCatalog — resolve the formatting for a single column from its
 * field name (and, as a fallback, its data type).
 *
 * Nested fields are matched on their **last segment only** (`position.
 * marketValue` → `marketValue`), so the binding path's parent objects never
 * skew the match.
 *
 * Resolution order (highest tier wins; longer match then earlier catalog
 * entry break ties within a tier):
 *   3. Exact alias match against the normalised matching token.
 *   2. Longest `suffix` match ("last element of the field name",
 *      e.g. `bidPrice` → `price`).
 *   1. Phonetic (Soundex) match against an alias — catches misspellings and
 *      spelling variants (`yeild` → `yield`, `quantites` → `quantity`). Only
 *      attempted for NUMERIC columns: phonetic matching is fuzzy, so a plain
 *      text column whose name merely shares a Soundex code with a numeric
 *      alias (e.g. `desk` → `daychg`) must NOT be dragged into a right-aligned
 *      numeric format — a string field stays left-aligned / untouched.
 *   0. Generic fallback by `cellDataType`:
 *        number  → right-aligned, grouped, 2dp
 *        date    → localised date
 *        boolean → centred
 *        other   → no change (null)
 *
 * A field-name match always wins over the type fallback so `asOfDate`
 * stored as an epoch number still gets a date format.
 */
import { FIELD_FORMAT_CATALOG } from './fieldFormatCatalog.js';
import type { AutoFormatAssignment, FieldFormatEntry } from './types.js';

/** Lowercase and strip every non-alphanumeric so casing/separators/abbrev
 *  differences (`unrealizedPnL` vs `unrealized_pnl` vs `unrealPnl`) collapse
 *  to a comparable key. */
export function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** The last dotted segment of a field path (`a.b.c` → `c`). */
function leafOf(field: string): string {
  const i = field.lastIndexOf('.');
  return i >= 0 ? field.slice(i + 1) : field;
}

/** Minimum suffix length — guards against tiny tokens matching by accident. */
const MIN_SUFFIX_LEN = 3;

/** Minimum token length before phonetic matching is attempted — Soundex on
 *  one- or two-letter tokens collapses far too aggressively. */
const MIN_SOUNDEX_LEN = 4;

/** AG-Grid `cellDataType` values treated as numeric. Phonetic matching is
 *  gated on this so a text column never latches onto a numeric catalog entry
 *  by Soundex collision. */
function isNumericCellDataType(cellDataType: string | undefined): boolean {
  if (!cellDataType) return false;
  const t = cellDataType.toLowerCase();
  return t === 'number' || t === 'numeric';
}

const SOUNDEX_CODES: Readonly<Record<string, string>> = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

/**
 * Russell Soundex code: the first letter followed by three digits encoding the
 * consonant sounds. Adjacent same-coded letters (and ones split only by `h`/
 * `w`) collapse to one digit; vowels and `y` reset so a repeated sound either
 * side of a vowel is kept. Returns `''` for an empty/letter-free token.
 */
export function soundex(token: string): string {
  const letters = token.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return '';
  const first = letters[0];
  let prev = SOUNDEX_CODES[first] ?? '';
  let out = first.toUpperCase();
  for (let i = 1; i < letters.length && out.length < 4; i++) {
    const ch = letters[i];
    const code = SOUNDEX_CODES[ch] ?? '';
    if (code && code !== prev) out += code;
    // `h`/`w` are transparent (don't reset `prev`); everything else does.
    if (ch !== 'h' && ch !== 'w') prev = code;
  }
  return (out + '000').slice(0, 4);
}

function toAssignment(entry: FieldFormatEntry): AutoFormatAssignment {
  const out: AutoFormatAssignment = {};
  if (entry.format !== undefined) out.valueFormatterTemplate = entry.format;
  if (entry.alignment !== undefined) out.alignment = entry.alignment;
  if (entry.typography !== undefined) out.typography = entry.typography;
  if (entry.headerName !== undefined) out.headerName = entry.headerName;
  return out;
}

function genericForType(cellDataType: string | undefined): AutoFormatAssignment | null {
  switch (cellDataType) {
    case 'number':
      return {
        alignment: 'right',
        valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2, thousands: true } },
      };
    case 'date':
    case 'dateString':
      return { valueFormatterTemplate: { kind: 'preset', preset: 'date' }, alignment: 'left' };
    case 'boolean':
      return { alignment: 'center' };
    default:
      return null;
  }
}

interface Candidate {
  entry: FieldFormatEntry;
  /** 3 = exact alias, 2 = suffix, 1 = phonetic (Soundex). */
  tier: 1 | 2 | 3;
  /** Matched-token length — longer wins within a tier. */
  len: number;
  /** Catalog index — earlier wins on a final tie. */
  order: number;
}

/**
 * Match a column to the catalog. `field` is the column's bound field path or
 * colId; `cellDataType` drives the generic fallback when nothing matches.
 * Nested paths match on their last segment only (`a.b.c` → `c`).
 * Returns `null` when neither the catalog nor the type fallback applies
 * (e.g. an untyped string column) — meaning "leave this column alone".
 */
export function matchFieldToCatalog(
  field: string | undefined,
  _headerName?: string,
  cellDataType?: string,
): AutoFormatAssignment | null {
  if (!field) return genericForType(cellDataType);

  // Nested fields match on the last segment only; flat fields match whole.
  const token = normalizeToken(leafOf(field));
  if (!token) return genericForType(cellDataType);

  // Phonetic matching only fires for numeric columns (see resolution-order
  // note above) — keeps fuzzy Soundex collisions off plain text fields.
  const tokenSoundex =
    isNumericCellDataType(cellDataType) && token.length >= MIN_SOUNDEX_LEN
      ? soundex(token)
      : '';

  let best: Candidate | null = null;
  const consider = (c: Candidate) => {
    if (
      best === null ||
      c.tier > best.tier ||
      (c.tier === best.tier && c.len > best.len) ||
      (c.tier === best.tier && c.len === best.len && c.order < best.order)
    ) {
      best = c;
    }
  };

  FIELD_FORMAT_CATALOG.forEach((entry, order) => {
    for (const alias of entry.aliases ?? []) {
      const a = normalizeToken(alias);
      if (!a) continue;
      if (a === token) {
        consider({ entry, tier: 3, len: a.length, order });
      } else if (
        tokenSoundex &&
        a.length >= MIN_SOUNDEX_LEN &&
        soundex(a) === tokenSoundex
      ) {
        consider({ entry, tier: 1, len: a.length, order });
      }
    }
    for (const suffix of entry.suffixes ?? []) {
      const s = normalizeToken(suffix);
      if (s.length < MIN_SUFFIX_LEN) continue;
      if (token.endsWith(s)) {
        consider({ entry, tier: 2, len: s.length, order });
      }
    }
  });

  if (best) return toAssignment((best as Candidate).entry);
  return genericForType(cellDataType);
}
