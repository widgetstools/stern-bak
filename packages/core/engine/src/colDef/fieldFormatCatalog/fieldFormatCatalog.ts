/**
 * FIELD_FORMAT_CATALOG — curated repository of common fixed-income (FI) and
 * equity trading-blotter field names, with the format, alignment and
 * typography they are conventionally displayed with.
 *
 * Field ids, captions and format/type hints are sourced from
 * `docs/blotter-field-catalog.md` (Identification, Reference, Order, Trade,
 * Position, Pricing, Risk, P&L, RFQ, Settlement sections) and its section-13
 * display conventions:
 *   - Signed P&L / change → green up / red down, via `excelFormat` colour
 *     tags (NOT a cell renderer) so the colouring is part of the value
 *     formatter and stays user-overridable
 *   - Yield / % / numeric → right-aligned, fixed decimals
 *   - Dates / timestamps  → localised (date / datetime presets)
 *   - Categorical (side / status / rating) → centred (no auto badge; the
 *     formatter toolbar's renderer picker still adds one on demand)
 *   - Ticker / symbol → bold, left-aligned
 *
 * Everything here is **native formatting-system state** — value formatters,
 * alignment and typography only. Auto Format never assigns an opaque cell
 * renderer, so each auto-applied aspect is editable from the formatter
 * toolbar and round-trips through profile persistence.
 *
 * Matching is by full field id (`aliases`) or the field's last element
 * (`suffixes`) — see {@link matchFieldToCatalog} — both normalised
 * (lowercased, non-alphanumerics stripped) so `unrealizedPnl`,
 * `unrealized_pnl` and `unrealPnl` collapse to one entry.
 *
 * Notes on formatting choices:
 *   - Percent/yield/coupon fields are rendered as plain right-aligned
 *     decimals (NOT the Intl `percent` preset, which would multiply by 100)
 *     because trading systems store these as the percentage number itself
 *     (e.g. coupon `4.500`), not a fraction. The header caption conveys the
 *     unit.
 *   - Sign-coloured fields use an `excelFormat` string with `[Green]`/`[Red]`
 *     sections. The Excel colour tags resolve to `--ds-accent-positive` /
 *     `--ds-accent-negative` design-system tokens (theme-safe) via the
 *     column-customization transform's colour resolver.
 *   - High-magnitude money/size fields are scaled with an Excel trailing
 *     comma: one comma divides by 1,000 (a `"K"` suffix), two divide by
 *     1,000,000 (an `"M"` suffix). So P&L shows `1.5K`, notional shows `2.4M`.
 *     Quantities use K; notional / market value use M. Small money (fees,
 *     commission, accrued interest) stays on plain decimals so it isn't
 *     squashed to `0.0M`.
 */
import type { FieldFormatEntry } from './types.js';

/** Number preset (decimals + optional grouping). */
const num = (decimals: number, thousands = true): FieldFormatEntry['format'] => ({
  kind: 'preset',
  preset: 'number',
  options: { decimals, thousands },
});

/** Excel format string (used for sign-coloured `[Green]`/`[Red]` and
 *  magnitude-scaled `,"K"` / `,,"M"` formats). */
const excel = (format: string): FieldFormatEntry['format'] => ({
  kind: 'excelFormat',
  format,
});

export const FIELD_FORMAT_CATALOG: readonly FieldFormatEntry[] = [
  // ─── Tickers / symbols ────────────────────────────────────────────────
  {
    id: 'ticker',
    category: 'identifier',
    aliases: ['ticker', 'symbol', 'issuerticker', 'underlyingticker'],
    typography: { bold: true },
    alignment: 'left',
  },

  // ─── Prices (dec / 32nds) ─────────────────────────────────────────────
  {
    id: 'price',
    category: 'price',
    aliases: [
      'price', 'bidprice', 'askprice', 'midprice', 'lastprice', 'cleanprice',
      'dirtyprice', 'theoprice', 'evalprice', 'priorclose', 'openprice',
      'highprice', 'lowprice', 'vwap', 'avgpx', 'avgcost', 'mark', 'limitprice',
      'stopprice', 'nextcallprice', 'coverprice', 'bestbid', 'bestoffer',
      'bid', 'ask', 'mid', 'last',
    ],
    suffixes: ['price'],
    format: num(4, false),
    alignment: 'right',
  },

  // ─── Yields / rates (pct) ─────────────────────────────────────────────
  {
    id: 'yield',
    category: 'yield',
    aliases: [
      'yield', 'ytm', 'ytw', 'ytc', 'currentyield', 'bondequivyield', 'bey',
      'bidyield', 'askyield',
    ],
    suffixes: ['yield'],
    format: num(3, false),
    alignment: 'right',
  },
  {
    id: 'rate',
    category: 'rate',
    aliases: [
      'coupon', 'couponrate', 'rate', 'interestrate', 'wac', 'tbacoupon',
      'weightedloanrate', 'wlr', 'dividendyield', 'divyield', 'borrowrate',
      'participationrate', 'povrate',
    ],
    format: num(3, false),
    alignment: 'right',
  },

  // ─── Spreads (bps) ────────────────────────────────────────────────────
  {
    id: 'spread',
    category: 'spread',
    aliases: [
      'spread', 'oas', 'asw', 'gspread', 'ispread', 'zspread', 'discountmargin',
      'dm', 'benchspread', 'nominalspread', 'swapspread', 'tedspread',
      'assetswaplevel', 'bidspread', 'askspread', 'markup', 'benchmarkspread',
    ],
    suffixes: ['spread'],
    format: num(1, false),
    alignment: 'right',
  },

  // ─── P&L (sign-coloured + K magnitude via excelFormat) ────────────────
  // 3 sections (positive;negative;zero): green / red / neutral. Negative
  // section carries an explicit `-` so the minus shows. The trailing comma
  // divides by 1,000 and appends a "K" suffix (P&L is reported in thousands).
  {
    id: 'pnl',
    category: 'pnl',
    aliases: [
      'pnl', 'pl', 'realizedpnl', 'unrealizedpnl', 'daypnl', 'dailypnl',
      'mtdpnl', 'ytdpnl', 'qtdpnl', 'inceptionpnl', 'itdpnl', 'carrypnl',
      'pricepnl', 'priceepnl', 'spreadpnl', 'ratepnl', 'fxpnl', 'financingpnl',
      'commissionpnl', 'stresspnl', 'unrealpnl', 'totalpnl',
    ],
    suffixes: ['pnl', 'pandl'],
    format: excel('[Green]#,##0.0,"K";[Red]-#,##0.0,"K";0'),
    alignment: 'right',
  },

  // ─── Change / return (sign-coloured via excelFormat) ──────────────────
  // Change shows an explicit +/- sign; percent change appends a literal "%".
  {
    id: 'change-pct',
    category: 'change',
    aliases: ['pctchange', 'pctchg', 'changepct', 'daychgpct', 'daychangepct', 'pricechangepct', 'returnpct', 'ytdreturn'],
    suffixes: ['chgpct', 'changepct', 'returnpct', 'pctchange'],
    format: excel('[Green]+0.00"%";[Red]-0.00"%";0.00"%"'),
    alignment: 'right',
  },
  {
    id: 'change',
    category: 'change',
    aliases: ['change', 'netchange', 'pricechange', 'daychange', 'daychg'],
    suffixes: ['change', 'netchg'],
    format: excel('[Green]+#,##0.00;[Red]-#,##0.00;0.00'),
    alignment: 'right',
  },

  // ─── Quantities / sizes (K magnitude) ─────────────────────────────────
  // Trailing comma divides by 1,000 and appends "K" — blotter sizes are
  // conventionally shown in thousands (e.g. 250,000 → "250K").
  {
    id: 'quantity',
    category: 'quantity',
    aliases: [
      'qty', 'quantity', 'orderqty', 'leavesqty', 'cumqty', 'displayqty',
      'minqty', 'longqty', 'shortqty', 'netqty', 'position', 'sodposition',
      'bidsize', 'asksize', 'rfqsize', 'axesize', 'sharesout', 'floatshares',
      'adv', 'lotsize', 'boughttoday', 'soldtoday', 'tradedtoday', 'origface',
      'currentface', 'currentfacepos', 'issuesize', 'amtoutstanding', 'volume',
      'filled', 'openqty', 'quantityface', 'facevalue', 'shares',
    ],
    suffixes: ['qty', 'size', 'face'],
    format: excel('#,##0.0,"K"'),
    alignment: 'right',
  },

  // ─── Fees / small money (plain decimals — NOT scaled) ─────────────────
  // Exact-alias matches here outrank the value-suffix tier below, so fees
  // and accrued interest keep full decimals instead of squashing to 0.0M.
  {
    id: 'fee',
    category: 'value',
    aliases: [
      'commission', 'fees', 'fee', 'secfee', 'brokerage', 'accruedint',
      'accruedinterest', 'minpiece', 'increment',
    ],
    format: num(2, true),
    alignment: 'right',
  },

  // ─── Notional / market value (M magnitude) ────────────────────────────
  // Two trailing commas divide by 1,000,000 and append "M" — notionals and
  // market values are reported in millions (e.g. 2,400,000 → "2.40M").
  {
    id: 'notional',
    category: 'value',
    aliases: [
      'marketvalue', 'mktval', 'notional', 'principal', 'netmoney',
      'costbasis', 'bookvalue', 'netsettleamt', 'marketcap', 'amount',
      'avgcostbasis',
    ],
    suffixes: ['value', 'money', 'amount', 'amt', 'notional'],
    format: excel('#,##0.00,,"M"'),
    alignment: 'right',
  },

  // ─── Risk analytics ───────────────────────────────────────────────────
  {
    id: 'duration',
    category: 'risk',
    aliases: ['duration', 'modduration', 'macduration', 'effduration', 'spreadduration', 'oad', 'wal', 'walrisk'],
    suffixes: ['duration'],
    format: num(2, false),
    alignment: 'right',
  },
  {
    id: 'risk-sensitivity',
    category: 'risk',
    aliases: ['dv01', 'pv01', 'cs01', 'ir01', 'spreaddv01', 'netdv01', 'jtd', 'var95', 'vega', 'theta', 'rho'],
    suffixes: ['dv01', 'pv01', 'cs01'],
    format: num(2, true),
    alignment: 'right',
  },
  {
    id: 'greeks-ratio',
    category: 'risk',
    aliases: ['convexity', 'effconvexity', 'oac', 'delta', 'gamma', 'beta', 'dscr', 'hedgeratio', 'indexratio', 'accruedfactor', 'fxrate', 'factor'],
    format: num(4, false),
    alignment: 'right',
  },
  {
    id: 'count',
    category: 'count',
    aliases: ['wam', 'wala', 'seasoning', 'accrueddays', 'ratingnumeric', 'vintage', 'quotecount', 'responsetime', 'faildays', 'version', 'messageseq'],
    format: num(0, true),
    alignment: 'right',
  },

  // ─── Percentages (neutral) ────────────────────────────────────────────
  {
    id: 'percent',
    category: 'percent',
    aliases: [
      'cpr', 'psa', 'smm', 'subordination', 'attachpoint', 'detachpoint', 'ltv',
      'originalltv', 'delinq30', 'delinq60', 'delinq90', 'cdr', 'severity',
      'watchlist', 'creditenh', 'weight', 'allocation', 'percent',
    ],
    suffixes: ['pct', 'percent', 'weight', 'ratio'],
    format: num(2, false),
    alignment: 'right',
  },

  // ─── Categorical (centred; no auto badge) ─────────────────────────────
  // Per-value badges/colours aren't expressible as a value formatter, so
  // Auto Format only centres these. Users can still add a `pill` / `side`
  // renderer from the formatter toolbar's renderer picker on demand.
  {
    id: 'rating',
    category: 'rating',
    aliases: ['rating', 'ratingsp', 'ratingmoody', 'ratingfitch', 'ratingcomposite', 'compositerating', 'moodysrating', 'sprating', 'fitchrating', 'moody', 'moodys', 'sp', 'fitch', 'ighy', 'ratingoutlook'],
    suffixes: ['rating'],
    alignment: 'center',
  },
  {
    id: 'side',
    category: 'categorical',
    aliases: ['side', 'rfqside', 'direction', 'buysell', 'way', 'axeflag'],
    alignment: 'center',
  },
  {
    id: 'rfq-status',
    category: 'categorical',
    aliases: ['rfqstatus'],
    alignment: 'center',
  },
  {
    id: 'status',
    category: 'categorical',
    aliases: ['status', 'ordstatus', 'orderstatus', 'tradestatus', 'allocstatus', 'settlestatus', 'settlementstatus', 'confirmstatus', 'state', 'rowstate'],
    suffixes: ['status'],
    alignment: 'center',
  },

  // ─── Timestamps (localised date + time) ───────────────────────────────
  {
    id: 'datetime',
    category: 'datetime',
    aliases: [
      'tradetime', 'ordertime', 'expiretime', 'marktime', 'pricetime',
      'quotetime', 'enteredtime', 'lastmodtime', 'lastticktime', 'tracetimestamp',
      'timestamp', 'lastupdate', 'lastupdated', 'updatedat', 'createdat', 'asoftime',
    ],
    suffixes: ['time', 'timestamp', 'datetime'],
    format: { kind: 'preset', preset: 'datetime' },
    alignment: 'left',
  },

  // ─── Dates (localised) ────────────────────────────────────────────────
  {
    id: 'date',
    category: 'date',
    aliases: [
      'date', 'maturity', 'maturitydate', 'tradedate', 'settledate',
      'settlementdate', 'issuedate', 'dateddate', 'firstcpndate', 'nextcpndate',
      'nextcalldate', 'workoutdate', 'auctiondate', 'ratingdate', 'exdivdate',
      'valuedate', 'effectivedate', 'expiry', 'expirydate',
    ],
    suffixes: ['date', 'maturity'],
    format: { kind: 'preset', preset: 'date' },
    alignment: 'left',
  },
];
