import type { IFloatingFilterComp, IFloatingFilterParams } from 'ag-grid-community';
import { BaseStreamSafeFilter, readParamField } from './streamSafeFloatingFilterBase';

/**
 * Stream-safe DATE floating filter — typeable input with smart parsing
 * for the many date shapes users actually want to filter against.
 * Pairs with `streamSafeNumber` / `streamSafeText` and shares the same
 * DOM scaffolding, focus-aware skip, clear button, and column-level
 * mounting strategy.
 *
 * **Supported input syntax:**
 *
 * | Input                          | Meaning                                              |
 * |--------------------------------|------------------------------------------------------|
 * | `2025-01-15`                   | equals 2025-01-15                                    |
 * | `=2025-01-15`                  | equals 2025-01-15 (explicit)                         |
 * | `>2025-01-15`                  | strictly after 2025-01-15                            |
 * | `>=2025-01-15`                 | on or after 2025-01-15 (AG-Grid inRange to far-future)|
 * | `<2025-01-15`                  | strictly before                                      |
 * | `<=2025-01-15`                 | on or before (AG-Grid inRange from far-past)         |
 * | `2025-01-01 to 2025-12-31`     | inclusive range                                      |
 * | `2025-01-01..2025-12-31`       | inclusive range (alternate syntax)                   |
 * | `14/02/2030 - 01/15/2065`      | inclusive range (hyphen with whitespace; safe        |
 * |                                | because ISO dates have no whitespace around their    |
 * |                                | internal hyphens)                                    |
 * | `>=2025-01-01 and <=2025-06-30`| compound AND                                         |
 * | `=2025-01-15 or =2025-02-15`   | compound OR                                          |
 * | `2025-01-15, 2025-02-15`       | equals any (set sub-filter values when present,      |
 * |                                | else compound OR of equals)                          |
 * | `2025`                         | year (expanded to Jan 1–Dec 31 range)                |
 * | `Jan 2025` / `2025-01`         | month (expanded to month range)                      |
 * | `Q1 2025`                      | quarter (expanded to 3-month range)                  |
 * | `today` / `yesterday` / `tomorrow` | relative day at 00:00–23:59 range                 |
 * | `last 10 minutes` / `last 5 seconds` | trailing window `[now − duration, now]`        |
 * | `last 6 months` / `last six months`  | trailing window (digit or worded count)        |
 * | `last year` / `last month`     | trailing window, count defaults to 1                 |
 * | `> today` / `>= yesterday` / `< tomorrow` | comparator + relative keyword             |
 * | `1734268800`                   | Unix epoch seconds → date                            |
 * | `1734268800000`                | Unix epoch milliseconds → date                       |
 * | `(blank)`                      | clear filter                                         |
 *
 * **Relative trailing windows.** `last <count> <unit>` resolves to a
 * period `[now − duration, now]`. Units (singular/plural/abbrev):
 * second(s)/sec, minute(s)/min, hour(s)/hr, day(s), week(s)/wk,
 * month(s)/mo, year(s)/yr. Count may be a digit (`last 18 months`), a
 * word (`a`/`an`/`one`…`twelve`, e.g. `last six months`), or omitted
 * for 1 (`last year`). Month/year subtraction clamps the day-of-month
 * (`Mar 31` minus one month → `Feb 28`).
 *
 * **Smart period expansion.** Partial inputs like `2025`, `Jan 2025`,
 * or `Q1 2025` expand to inclusive day ranges so the filter matches
 * every record in that period without the user spelling out both
 * endpoints. Full dates and explicit operators are kept as written.
 *
 * **Date format coverage.** ISO (`YYYY-MM-DD`), US slash (`MM/DD/YYYY`),
 * EU slash (`DD/MM/YYYY` — auto-detected when one part exceeds 12, or
 * forced by `dateLocale: 'eu'`), EU dot (`DD.MM.YYYY`), month-name with
 * optional ordinal suffix (`Jan 15 2025`, `15 January 2025`, `12th June
 * 25`, `1st Jan 2025`, `Jan 2025`), quarter (`Q1 2025`), and Unix epoch
 * numbers (10 = seconds, 13 = milliseconds). Year-only input is treated
 * as a period, not a single date — typing `2025` matches every record
 * in 2025.
 *
 * **Locale.** Slash dates that are ambiguous (both `MM/DD/YYYY` and
 * `DD/MM/YYYY` would be valid calendar dates — e.g. `10/12/2024`)
 * default to US `MM/DD/YYYY`. Switch to EU `DD/MM/YYYY` by passing
 * `floatingFilterComponentParams: { dateLocale: 'eu' }` on the column.
 * Inputs where only one interpretation is valid (e.g. `25/12/2024`
 * because 25 can't be a month) are always parsed unambiguously.
 *
 * **AG-Grid date filter quirk.** AG-Grid's date filter supports
 * `equals`, `notEqual`, `greaterThan`, `lessThan`, and `inRange` — but
 * NOT `greaterThanOrEqual` / `lessThanOrEqual`. We synthesize those by
 * emitting `inRange` with a far-future or far-past sentinel; the
 * comparison result is identical and the user never sees the wiring.
 *
 * **Streaming clobber defense.** Same as the number/text filters:
 * `onParentModelChanged` writes are ignored while the input has focus.
 *
 * **Performance.** All regexes are module-scope (compiled once). Parsing
 * dispatches by leading character / shape, so most inputs hit at most
 * 1–2 regex tests before resolving. No `Date.parse` fallback — that
 * function's behavior varies by browser locale and silently accepts
 * garbage; we'd rather return `null` and leave the previous filter in
 * place than apply an unintended match.
 *
 * Registered as `streamSafeDate` in `gridOptions.components`. Apply at
 * the column level by setting `floatingFilterComponent: 'streamSafeDate'`
 * in a column that uses `agDateColumnFilter` (or `agMultiColumnFilter`
 * with a date sub-filter).
 */
export class StreamSafeDateFloatingFilter extends BaseStreamSafeFilter implements IFloatingFilterComp {
  private locale: DateLocale = 'us';

  protected override onInit(params: IFloatingFilterParams): void {
    this.locale = readParamField<DateLocale>(params, 'dateLocale') === 'eu' ? 'eu' : 'us';
  }

  protected placeholder(): string {
    return this.locale === 'eu'
      ? '2025, Jan 2025, >2025-01-01, 12/06/2025 to today'
      : '2025, Jan 2025, >2025-01-01, 06/12/2025 to today';
  }

  protected trackLastTyped(): boolean {
    return true;
  }

  protected stringifyModel(model: unknown): string {
    return stringifyDateModel(model);
  }

  /**
   * Parse the user's input and route it to the right sub-filter slot.
   * Bare-date CSV → set sub-filter (when present). Everything else
   * → date sub-filter with single or compound model.
   */
  protected applyValue(rawValue: string): void {
    const trimmed = rawValue.trim();
    const ctx = this.getColumnContext();
    const dateIdx = ctx.primaryIdx('agDateColumnFilter');

    // Empty → clear
    if (trimmed === '') {
      if (ctx.isInsideMulti) {
        this.pushColumnModel(ctx.colId, this.buildMultiEnvelope(ctx.subFilters, {}));
      } else {
        this.pushStandaloneClear();
      }
      return;
    }

    // Bare-date CSV detection — no operators, no and/or, no range keyword.
    // Each comma-token must parse to a single date (not a period) for the
    // set-filter route. Periods like `2025, 2026` will fall through to the
    // operator parser (which expands them to compound OR ranges).
    const hasOperator = /[<>=!]/.test(trimmed);
    const hasRangeKeyword = /\bto\b|\.\./.test(trimmed);
    const hasAndOr = /\b(and|or)\b/i.test(trimmed);
    if (
      trimmed.includes(',') &&
      !hasOperator &&
      !hasRangeKeyword &&
      !hasAndOr
    ) {
      const tokens = trimmed.split(',').map((t) => t.trim()).filter((t) => t !== '');
      const parsed = tokens.map((t) => smartDateParse(t, this.locale));
      const allSpecific = parsed.every((p) => p != null && p.kind === 'instant');
      if (allSpecific && parsed.length > 0) {
        const isoValues = parsed
          .map((p) => (p as InstantParse).date)
          .map(toIsoDateOnly);
        if (ctx.isInsideMulti && ctx.setIdx >= 0) {
          const setModel = { filterType: 'set', values: isoValues };
          this.pushColumnModel(
            ctx.colId,
            this.buildMultiEnvelope(ctx.subFilters, { [ctx.setIdx]: setModel }),
          );
          return;
        }
        const conditions = isoValues.map(
          (v): DateSingleModel => ({
            filterType: 'date',
            type: 'equals',
            dateFrom: `${v} 00:00:00`,
          }),
        );
        const compound = { filterType: 'date', operator: 'OR' as const, conditions };
        if (ctx.isInsideMulti && dateIdx >= 0) {
          this.pushColumnModel(
            ctx.colId,
            this.buildMultiEnvelope(ctx.subFilters, { [dateIdx]: compound }),
          );
        } else {
          this.pushColumnModel(ctx.colId, compound);
        }
        return;
      }
      // Else: at least one token wasn't a specific date — fall through to
      // the expression parser (handles things like `Q1 2025, Q3 2025`).
    }

    // Parse as a date filter model
    const model = parseDateExpression(trimmed, this.locale);
    if (model == null) {
      // Couldn't parse — leave the previous filter in place. Don't
      // emit anything (avoids clearing on transient typo).
      return;
    }

    if (ctx.isInsideMulti) {
      const targetIdx = dateIdx >= 0 ? dateIdx : 0;
      this.pushColumnModel(
        ctx.colId,
        this.buildMultiEnvelope(ctx.subFilters, { [targetIdx]: model }),
      );
    } else {
      this.pushColumnModel(ctx.colId, model);
    }
  }
}

// ─── Date filter model types ─────────────────────────────────────────────────

/** Disambiguator for slash dates where both interpretations are valid
 *  calendar dates. `us` (default) → `MM/DD/YYYY`; `eu` → `DD/MM/YYYY`.
 *  Unambiguous inputs (one part > 12) bypass this. */
type DateLocale = 'us' | 'eu';

interface DateSingleModel {
  filterType: 'date';
  type: 'equals' | 'notEqual' | 'greaterThan' | 'lessThan' | 'inRange';
  dateFrom: string;
  dateTo?: string;
}

interface DateCompoundModel {
  filterType: 'date';
  operator: 'AND' | 'OR';
  conditions: DateSingleModel[];
}

type DateModel = DateSingleModel | DateCompoundModel;

/** AG-Grid date filter uses `YYYY-MM-DD HH:mm:ss`. Sentinels used to
 *  synthesize `>=` / `<=` via `inRange`. */
const FAR_PAST = '1900-01-01 00:00:00';
const FAR_FUTURE = '9999-12-31 23:59:59';

// ─── Smart date parser ───────────────────────────────────────────────────────

type InstantParse = { kind: 'instant'; date: Date };
type PeriodParse = { kind: 'period'; from: Date; to: Date };
type SmartParse = InstantParse | PeriodParse;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Module-scope regexes — compiled once. Anchored where it matters.
const RE_PURE_DIGITS    = /^\d+$/;
const RE_ISO_YEAR       = /^(\d{4})$/;
const RE_ISO_MONTH      = /^(\d{4})-(\d{1,2})$/;
const RE_ISO_DATE       = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const RE_ISO_DATETIME   = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:Z|[+-]\d{2}:?\d{2})?$/;
const RE_SLASH_DATE     = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/;
const RE_DOT_DATE       = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
const RE_QUARTER        = /^q([1-4])[\s-]*(\d{4})$|^(\d{4})[\s-]*q([1-4])$/i;
const RE_MONTH_NAME_YR  = /^([a-z]{3,9})[\s,]*(\d{4})$|^(\d{4})[\s,-]*([a-z]{3,9})$/i;
const RE_DAY_MON_YR     = /^(\d{1,2})[\s,/-]+([a-z]{3,9})[\s,/-]+(\d{2,4})$/i;
const RE_MON_DAY_YR     = /^([a-z]{3,9})[\s,/-]+(\d{1,2})[\s,/-]+(\d{2,4})$/i;

/**
 * Smart-parse a single date token. Returns either an `instant` (a
 * specific date/time) or a `period` (start+end of a range) for partial
 * inputs like `2025`, `Jan 2025`, or `Q1 2025`. `null` on failure.
 *
 * Hot path priorities:
 *   1. Cheap shape tests first (regex match, no Date construction).
 *   2. Construct Dates only when shape matches.
 *   3. No `Date.parse(input)` fallback — its locale-sensitive
 *      acceptance of malformed strings causes silent bugs.
 */
function smartDateParse(input: string, locale: DateLocale = 'us', now: Date = new Date()): SmartParse | null {
  const raw = input.trim();
  if (!raw) return null;

  // Relative keywords. Cheap string-equality test before any regex.
  // `now` is injectable so trailing-window math is deterministic in tests;
  // it defaults to the current instant in production.
  const lower = raw.toLowerCase();
  if (lower === 'today' || lower === 'now') return dayPeriod(new Date(now.getTime()));
  if (lower === 'yesterday') {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() - 1);
    return dayPeriod(d);
  }
  if (lower === 'tomorrow') {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + 1);
    return dayPeriod(d);
  }

  // Relative trailing windows — `last 10 minutes`, `last 6 months`,
  // `last year`. Resolves to a period `[now − duration, now]`.
  if (lower.startsWith('last')) {
    const rel = parseRelativeWindow(lower, now);
    if (rel) return rel;
    // Not a recognized window — fall through to the regex cascade.
  }

  // Strip ordinal suffixes (1st, 2nd, 3rd, 4th, 12th, 21st, …) so the
  // date regexes can match without each having to encode every variant.
  // Applied AFTER relative-keyword checks so `yesterday`/`tomorrow`
  // can't be corrupted, and case-insensitively.
  const t = raw.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');

  // Pure digits — could be year, Unix seconds, or Unix milliseconds.
  if (RE_PURE_DIGITS.test(t)) {
    if (t.length === 4) {
      const yr = Number(t);
      if (yr >= 1900 && yr <= 2100) return yearPeriod(yr);
    }
    if (t.length === 10) {
      const sec = Number(t);
      const d = new Date(sec * 1000);
      if (!Number.isNaN(d.getTime())) return { kind: 'instant', date: d };
    }
    if (t.length === 13) {
      const ms = Number(t);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return { kind: 'instant', date: d };
    }
    // 5–7 / 8–9 / 11–12 / 14+ digits: unrecognized — fall through.
  }

  // ISO datetime — full timestamp.
  const isoDT = RE_ISO_DATETIME.exec(t);
  if (isoDT) {
    const d = mkDate(+isoDT[1], +isoDT[2] - 1, +isoDT[3], +isoDT[4], +isoDT[5], +(isoDT[6] ?? 0));
    return d ? { kind: 'instant', date: d } : null;
  }
  // ISO date.
  const isoD = RE_ISO_DATE.exec(t);
  if (isoD) {
    const d = mkDate(+isoD[1], +isoD[2] - 1, +isoD[3]);
    return d ? { kind: 'instant', date: d } : null;
  }
  // ISO month — expands to month period.
  const isoM = RE_ISO_MONTH.exec(t);
  if (isoM) {
    return monthPeriod(+isoM[1], +isoM[2] - 1);
  }
  // ISO year — expands to year period. (RE_PURE_DIGITS above already
  // covered 4-digit input; this matches when there's structure.)
  const isoY = RE_ISO_YEAR.exec(t);
  if (isoY) {
    return yearPeriod(+isoY[1]);
  }

  // Quarter — `Q1 2025` or `2025 Q1`.
  const q = RE_QUARTER.exec(t);
  if (q) {
    const qNum = +(q[1] ?? q[4]);
    const yr = +(q[2] ?? q[3]);
    return quarterPeriod(yr, qNum);
  }

  // Month-name + year — `Jan 2025` or `2025 January`. Expands to month.
  const my = RE_MONTH_NAME_YR.exec(t);
  if (my) {
    const monStr = (my[1] ?? my[4]).toLowerCase();
    const yr = +(my[2] ?? my[3]);
    const monIdx = MONTHS[monStr];
    if (monIdx !== undefined) return monthPeriod(yr, monIdx);
  }

  // Day-month-name-year — `15 Jan 2025`, `15-Jan-2025`, `15/Jan/2025`.
  const dmy = RE_DAY_MON_YR.exec(t);
  if (dmy) {
    const day = +dmy[1];
    const monIdx = MONTHS[dmy[2].toLowerCase()];
    const yr = normalizeYear(+dmy[3]);
    if (monIdx !== undefined) {
      const d = mkDate(yr, monIdx, day);
      if (d) return { kind: 'instant', date: d };
    }
  }
  // Month-name-day-year — `Jan 15 2025`, `Jan 15, 2025`.
  const mdy = RE_MON_DAY_YR.exec(t);
  if (mdy) {
    const monIdx = MONTHS[mdy[1].toLowerCase()];
    const day = +mdy[2];
    const yr = normalizeYear(+mdy[3]);
    if (monIdx !== undefined) {
      const d = mkDate(yr, monIdx, day);
      if (d) return { kind: 'instant', date: d };
    }
  }

  // Slash date — US (MM/DD/YYYY) vs EU (DD/MM/YYYY). Disambiguate by
  // checking each part: an out-of-month value (>12) forces the
  // interpretation. When both parts are <=12, fall back to the
  // caller-supplied locale.
  const sl = RE_SLASH_DATE.exec(t);
  if (sl) {
    const a = +sl[1];
    const b = +sl[2];
    const c = +sl[3];
    // 4-digit year first — `YYYY/MM/DD`.
    if (a >= 1000) {
      const d = mkDate(a, b - 1, c);
      if (d) return { kind: 'instant', date: d };
    }
    // Unambiguous day-first — first part > 12 can't be a month.
    if (a > 12 && b >= 1 && b <= 12) {
      const d = mkDate(normalizeYear(c), b - 1, a);
      if (d) return { kind: 'instant', date: d };
    }
    // Unambiguous month-first — second part > 12 can't be a month.
    if (b > 12 && a >= 1 && a <= 12) {
      const d = mkDate(normalizeYear(c), a - 1, b);
      if (d) return { kind: 'instant', date: d };
    }
    // Both parts <= 12 — honour the configured locale.
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
      const [monIdx, day] =
        locale === 'eu' ? [b - 1, a] : [a - 1, b];
      const d = mkDate(normalizeYear(c), monIdx, day);
      if (d) return { kind: 'instant', date: d };
    }
  }

  // EU dot date — `15.01.2025`.
  const dot = RE_DOT_DATE.exec(t);
  if (dot) {
    const day = +dot[1];
    const mon = +dot[2];
    const yr = normalizeYear(+dot[3]);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      const d = mkDate(yr, mon - 1, day);
      if (d) return { kind: 'instant', date: d };
    }
  }

  return null;
}

// ─── Period helpers ──────────────────────────────────────────────────────────

function yearPeriod(year: number): PeriodParse | null {
  if (year < 1 || year > 9999) return null;
  return {
    kind: 'period',
    from: new Date(year, 0, 1, 0, 0, 0),
    to: new Date(year, 11, 31, 23, 59, 59),
  };
}

function monthPeriod(year: number, monthIdx: number): PeriodParse | null {
  if (monthIdx < 0 || monthIdx > 11 || year < 1 || year > 9999) return null;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return {
    kind: 'period',
    from: new Date(year, monthIdx, 1, 0, 0, 0),
    to: new Date(year, monthIdx, lastDay, 23, 59, 59),
  };
}

function quarterPeriod(year: number, quarter: number): PeriodParse | null {
  if (quarter < 1 || quarter > 4 || year < 1 || year > 9999) return null;
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth + 1, 0).getDate();
  return {
    kind: 'period',
    from: new Date(year, startMonth, 1, 0, 0, 0),
    to: new Date(year, endMonth, lastDay, 23, 59, 59),
  };
}

function dayPeriod(d: Date): PeriodParse {
  return {
    kind: 'period',
    from: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
    to: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
  };
}

// ─── Relative trailing windows ─────────────────────────────────────────────

/** Worded counts. Digits handle everything beyond twelve. `a`/`an` = 1. */
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

type RelUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Singular / plural / common-abbreviation aliases → canonical unit. */
const UNIT_ALIASES: Record<string, RelUnit> = {
  second: 'second', seconds: 'second', sec: 'second', secs: 'second',
  minute: 'minute', minutes: 'minute', min: 'minute', mins: 'minute',
  hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour',
  day: 'day', days: 'day',
  week: 'week', weeks: 'week', wk: 'week', wks: 'week',
  month: 'month', months: 'month', mo: 'month', mos: 'month',
  year: 'year', years: 'year', yr: 'year', yrs: 'year',
};

// `last [<count>|<word>] <unit>` — count optional (defaults to 1, e.g.
// `last month`). Already lowercased by the caller.
const RE_RELATIVE_WINDOW = /^last\s+(?:(\d+)\s+|([a-z]+)\s+)?([a-z]+)$/;

/**
 * Parse a relative trailing window (`last 10 minutes`, `last six months`,
 * `last year`) into a period `[now − duration, now]`. Returns null when the
 * count or unit isn't recognized so the caller falls through to the regex
 * cascade (and ultimately leaves the previous filter in place on garbage).
 */
function parseRelativeWindow(input: string, now: Date): PeriodParse | null {
  const m = RE_RELATIVE_WINDOW.exec(input.trim());
  if (!m) return null;
  const [, digits, word, unitRaw] = m;

  let count: number;
  if (digits != null) {
    count = Number(digits);
  } else if (word != null) {
    const w = WORD_NUMBERS[word];
    if (w === undefined) return null;
    count = w;
  } else {
    count = 1; // bare `last month` / `last year`
  }
  if (!Number.isFinite(count) || count < 1) return null;

  const unit = UNIT_ALIASES[unitRaw];
  if (!unit) return null;

  const from = subtractWindow(now, count, unit);
  return { kind: 'period', from, to: new Date(now.getTime()) };
}

/** Subtract `count` of `unit` from `now`. Sub-day units use millisecond
 *  arithmetic; day/week/month/year are calendar-aware (month/year clamp the
 *  day-of-month so `Mar 31 − 1 month` lands on Feb 28, not a rolled-over
 *  Mar 3). */
function subtractWindow(now: Date, count: number, unit: RelUnit): Date {
  switch (unit) {
    case 'second': return new Date(now.getTime() - count * 1000);
    case 'minute': return new Date(now.getTime() - count * 60_000);
    case 'hour':   return new Date(now.getTime() - count * 3_600_000);
    case 'day': {
      const d = new Date(now.getTime());
      d.setDate(d.getDate() - count);
      return d;
    }
    case 'week': {
      const d = new Date(now.getTime());
      d.setDate(d.getDate() - count * 7);
      return d;
    }
    case 'month': return subtractMonths(now, count);
    case 'year':  return subtractMonths(now, count * 12);
  }
}

/** Calendar month subtraction with day-of-month clamping. */
function subtractMonths(now: Date, months: number): Date {
  const total = now.getMonth() - months;
  const targetYear = now.getFullYear() + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(now.getDate(), lastDay);
  return new Date(targetYear, targetMonth, day, now.getHours(), now.getMinutes(), now.getSeconds());
}

// ─── Date construction guards ────────────────────────────────────────────────

/**
 * Construct a Date and verify its components round-trip — protects
 * against silent overflow (e.g. `mkDate(2025, 1, 31)` becoming March
 * because February has 28/29 days). Returns null when the requested
 * components don't form a valid calendar date.
 */
function mkDate(
  y: number,
  monIdx: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(monIdx) || !Number.isFinite(d)) return null;
  const dt = new Date(y, monIdx, d, h, mi, s);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== monIdx ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** `25` → `2025`, `99` → `1999`, `2025` → `2025`. Splits at 70 like
 *  most modern locales — adjust the pivot if the data ever spans
 *  pre-1970 records. */
function normalizeYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

// ─── Expression parser ──────────────────────────────────────────────────────

const COMPARATOR_TOKENS: Array<{ op: string; type: DateSingleModel['type'] | 'ge' | 'le' }> = [
  // Order matters — multi-char operators must be tested first.
  { op: '>=', type: 'ge' },
  { op: '<=', type: 'le' },
  { op: '<>', type: 'notEqual' },
  { op: '!=', type: 'notEqual' },
  { op: '>',  type: 'greaterThan' },
  { op: '<',  type: 'lessThan' },
  { op: '=',  type: 'equals' },
];

/**
 * Parse a single comparison/period fragment. Returns one or more
 * `DateSingleModel` entries (one for most ops, two for compounds
 * synthesized from period equals, etc.).
 */
function parseSingleCondition(s: string, locale: DateLocale = 'us', now: Date = new Date()): DateSingleModel[] | null {
  const t = s.trim();
  if (!t) return null;

  // Try comparator + value.
  for (const { op, type } of COMPARATOR_TOKENS) {
    if (t.startsWith(op)) {
      const rhs = t.slice(op.length).trim();
      const parsed = smartDateParse(rhs, locale, now);
      if (!parsed) return null;

      const lower = parsed.kind === 'instant'
        ? toAgGridDateTime(parsed.date)
        : toAgGridDateTime(parsed.from);
      const upper = parsed.kind === 'instant'
        ? toAgGridDateTime(parsed.date)
        : toAgGridDateTime(parsed.to);

      switch (type) {
        case 'equals': {
          if (parsed.kind === 'period') {
            return [{ filterType: 'date', type: 'inRange', dateFrom: lower, dateTo: upper }];
          }
          return [{ filterType: 'date', type: 'equals', dateFrom: lower }];
        }
        case 'notEqual': {
          // notEqual on a period isn't expressible as a single AG-Grid
          // model — fall back to notEqual on the period's start day,
          // which is the most useful approximation.
          return [{ filterType: 'date', type: 'notEqual', dateFrom: lower }];
        }
        case 'greaterThan':
          return [{ filterType: 'date', type: 'greaterThan', dateFrom: upper }];
        case 'lessThan':
          return [{ filterType: 'date', type: 'lessThan', dateFrom: lower }];
        case 'ge':
          return [{ filterType: 'date', type: 'inRange', dateFrom: lower, dateTo: FAR_FUTURE }];
        case 'le':
          return [{ filterType: 'date', type: 'inRange', dateFrom: FAR_PAST, dateTo: upper }];
        default:
          return null;
      }
    }
  }

  // Range syntax — `A to B`, `A .. B`, or `A - B`. The hyphen variant
  // requires whitespace on at least one side so it never matches the
  // internal `-` of ISO dates (which have no whitespace around them).
  // `\s+-\s*` covers `A -B`; `\s*-\s+` covers `A- B`; together with
  // `\s+to\s+` and `\s*\.\.\s*` we accept every common range form.
  const rangeMatch = /^(.+?)(?:\s+to\s+|\s*\.\.\s*|\s+-\s*|\s*-\s+)(.+)$/i.exec(t);
  if (rangeMatch) {
    const a = smartDateParse(rangeMatch[1].trim(), locale, now);
    const b = smartDateParse(rangeMatch[2].trim(), locale, now);
    if (a && b) {
      const from = a.kind === 'instant' ? a.date : a.from;
      const to = b.kind === 'instant' ? b.date : b.to;
      return [{
        filterType: 'date',
        type: 'inRange',
        dateFrom: toAgGridDateTime(from),
        dateTo: toAgGridDateTime(to),
      }];
    }
    return null;
  }

  // Bare value → equals (for instants) or inRange (for periods).
  const parsed = smartDateParse(t, locale, now);
  if (!parsed) return null;
  if (parsed.kind === 'period') {
    return [{
      filterType: 'date',
      type: 'inRange',
      dateFrom: toAgGridDateTime(parsed.from),
      dateTo: toAgGridDateTime(parsed.to),
    }];
  }
  return [{
    filterType: 'date',
    type: 'equals',
    dateFrom: toAgGridDateTime(parsed.date),
  }];
}

/**
 * Parse a full date expression. AND, OR, comma-shorthand, range, or
 * single value. Returns AG-Grid date filter model or null.
 *
 * Exported for unit testing — `now` is injectable so trailing-window
 * expressions (`last 6 months`) resolve deterministically; it defaults
 * to the current instant in production.
 */
export function parseDateExpression(
  input: string,
  locale: DateLocale = 'us',
  now: Date = new Date(),
): DateModel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const hasAnd = /\band\b/.test(lower);
  const hasOr = /\bor\b/.test(lower);

  if (hasAnd && hasOr) {
    // Mixed — best-effort: return the first parseable fragment.
    const parts = trimmed.split(/\s+(?:and|or)\s+/i);
    for (const p of parts) {
      const single = parseSingleCondition(p, locale, now);
      if (single && single.length > 0) {
        return single.length === 1 ? single[0] : { filterType: 'date', operator: 'AND', conditions: single };
      }
    }
    return null;
  }

  if (hasAnd || hasOr) {
    const splitter = hasAnd ? /\s+and\s+/i : /\s+or\s+/i;
    const op = hasAnd ? 'AND' : 'OR';
    const parts = trimmed.split(splitter);
    const conditions: DateSingleModel[] = [];
    for (const p of parts) {
      const single = parseSingleCondition(p, locale, now);
      if (single) conditions.push(...single);
    }
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { filterType: 'date', operator: op as 'AND' | 'OR', conditions };
  }

  // Comma → OR shorthand. Skip if the comma is inside a single literal
  // (e.g. `Jan 15, 2025`) — heuristic: only treat as separator when at
  // least one side parses on its own.
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim()).filter((p) => p !== '');
    const conditions: DateSingleModel[] = [];
    for (const p of parts) {
      const single = parseSingleCondition(p, locale, now);
      if (single) conditions.push(...single);
    }
    if (conditions.length >= 2) {
      return { filterType: 'date', operator: 'OR', conditions };
    }
    // Fall through — couldn't split cleanly, try the whole string.
  }

  const single = parseSingleCondition(trimmed, locale, now);
  if (!single || single.length === 0) return null;
  if (single.length === 1) return single[0];
  return { filterType: 'date', operator: 'AND', conditions: single };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** AG-Grid date filter expects `YYYY-MM-DD HH:mm:ss`. */
function toAgGridDateTime(d: Date): string {
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function toIsoDateOnly(d: Date): string {
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function pad4(n: number): string {
  if (n >= 1000) return String(n);
  if (n >= 100) return `0${n}`;
  if (n >= 10) return `00${n}`;
  return `000${n}`;
}

// ─── Reverse stringifier (model → display) ───────────────────────────────────

/**
 * Reverse-engineer a friendly string from an applied date filter
 * model. Only used as fallback when the user hasn't typed anything
 * recently (e.g. model was set from the popup).
 */
function stringifyDateModel(model: unknown): string {
  if (model == null) return '';
  // Multi-filter envelope walk
  if ((model as { filterType?: string }).filterType === 'multi') {
    const envelope = model as { filterModels?: unknown[] };
    for (const sub of envelope.filterModels ?? []) {
      if (!sub) continue;
      const s = stringifyDateModel(sub);
      if (s) return s;
    }
    return '';
  }
  // Set sub-filter values
  if ((model as { filterType?: string; values?: unknown[] }).filterType === 'set') {
    const values = (model as { values?: unknown[] }).values;
    return Array.isArray(values) ? values.join(', ') : '';
  }
  const m = model as Partial<DateSingleModel & DateCompoundModel>;
  if (Array.isArray(m.conditions) && m.conditions.length > 0) {
    const sep = m.operator === 'AND' ? ' and ' : ', ';
    return m.conditions.map((c) => stringifySingle(c)).join(sep);
  }
  return stringifySingle(m as DateSingleModel);
}

function stringifySingle(m: DateSingleModel): string {
  if (!m || typeof m.dateFrom !== 'string') return '';
  const from = m.dateFrom.slice(0, 10);
  const to = m.dateTo?.slice(0, 10);
  switch (m.type) {
    case 'greaterThan':  return `>${from}`;
    case 'lessThan':     return `<${from}`;
    case 'equals':       return from;
    case 'notEqual':     return `!=${from}`;
    case 'inRange':
      if (to === FAR_FUTURE.slice(0, 10)) return `>=${from}`;
      if (from === FAR_PAST.slice(0, 10)) return `<=${to ?? ''}`;
      return `${from} to ${to ?? ''}`;
    default:             return from;
  }
}
