/**
 * CSV price-file parsing for the bulk import flow.
 *
 * Accepted shape: a `cusip,price` pair per line, with an optional header
 * row, quotes, a BOM, blank lines and extra columns tolerated — the file
 * a trader exports from a pricing sheet, not a spec-perfect artifact.
 * Anything unparseable is reported per line, never silently dropped.
 */
export interface CsvPriceRow {
  cusip: string;
  price: number;
}

export interface CsvParseResult {
  rows: CsvPriceRow[];
  errors: Array<{ line: number; text: string; reason: string }>;
}

const strip = (s: string) => s.replace(/^﻿/, '').trim().replace(/^"(.*)"$/, '$1').trim();

export function parsePriceCsv(text: string): CsvParseResult {
  const rows: CsvPriceRow[] = [];
  const errors: CsvParseResult['errors'] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const cells = line.split(',').map(strip);
    const cusip = (cells[0] ?? '').toUpperCase();
    const priceRaw = cells[1] ?? '';
    // Header row: first line whose price cell is not numeric.
    if (i === 0 && cusip && Number.isNaN(Number(priceRaw))) return;
    if (!cusip) {
      errors.push({ line: i + 1, text: line, reason: 'missing cusip' });
      return;
    }
    const price = Number(priceRaw);
    if (!priceRaw || !Number.isFinite(price)) {
      errors.push({ line: i + 1, text: line, reason: `price "${priceRaw}" is not a number` });
      return;
    }
    if (price <= 0 || price > 500) {
      errors.push({ line: i + 1, text: line, reason: `price ${price} outside sanity band (0, 500]` });
      return;
    }
    if (seen.has(cusip)) {
      errors.push({ line: i + 1, text: line, reason: `duplicate cusip ${cusip} — first value wins` });
      return;
    }
    seen.add(cusip);
    rows.push({ cusip, price });
  });
  return { rows, errors };
}
