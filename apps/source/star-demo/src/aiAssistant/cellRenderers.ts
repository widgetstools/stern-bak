/**
 * The cell-renderer catalogue, so the assistant can offer real renderers
 * instead of inventing ids.
 *
 * Mirrors `cellRendererCatalogue` in
 * `@wellsfargo-starui/design-system/cell-renderers-registry`. Copied rather
 * than imported for the same reason as the indicator icons: that module also
 * holds the renderer CLASSES, so importing it drags AG-Grid renderer
 * implementations into a window that mounts no grid.
 * `cellRenderers.test.ts` asserts this list matches the real one.
 *
 * An unknown `cellRendererId` writes cleanly and renders nothing, so every
 * renderer the model names is validated against this list first.
 */

export type CellRendererCategory = 'visual-analytics' | 'composite' | 'fi-specialised' | 'existing';

export interface CellRendererEntry {
  id: string;
  label: string;
  category: CellRendererCategory;
  /** True when the renderer reads per-column config from `cellRendererConfig`. */
  configurable: boolean;
  description: string;
}

export const CELL_RENDERERS: ReadonlyArray<CellRendererEntry> = [
  { id: 'pill', label: 'Pill', category: 'visual-analytics', configurable: true, description: 'Coloured pill with per-value background & foreground rules.' },
  { id: 'heatmap', label: 'Heatmap', category: 'visual-analytics', configurable: true, description: 'Colour-scale gradient driven by numeric value.' },
  { id: 'percent-bar', label: 'Percent Bar', category: 'visual-analytics', configurable: true, description: 'Proportional horizontal bar inside the cell.' },
  { id: 'trend-arrow', label: 'Trend Arrow + Delta', category: 'visual-analytics', configurable: true, description: 'Directional arrow with magnitude, configurable threshold. Reflects the SIGN of the value, not a change over time.' },
  { id: 'sparkline', label: 'Sparkline', category: 'visual-analytics', configurable: true, description: 'Inline mini-chart from an array of numbers.' },
  { id: 'multi-line', label: 'Multi-Line', category: 'composite', configurable: true, description: 'Two-line cell: primary value + secondary field.' },
  { id: 'icon-text', label: 'Icon + Text', category: 'composite', configurable: true, description: 'Icon next to the value.' },
  { id: 'country-flag', label: 'Country Flag', category: 'composite', configurable: true, description: 'Flag emoji from an ISO-3166 country code OR an ISO-4217 currency code (USD -> US, EUR -> EU), plus optional label.' },
  { id: 'rating-delta', label: 'Rating Delta', category: 'fi-specialised', configurable: true, description: 'Credit rating with up/down arrow vs. a previous-rating field.' },
  { id: 'time-since', label: 'Time Since', category: 'fi-specialised', configurable: true, description: 'Auto-refreshing relative time ("5m ago").' },
  { id: 'allocation-bar', label: 'Allocation Bar', category: 'fi-specialised', configurable: true, description: 'Stacked horizontal bar coloured by key.' },
  { id: 'side', label: 'Buy / Sell side', category: 'existing', configurable: false, description: 'BUY / SELL badge - green / red, monospaced.' },
  { id: 'status-badge', label: 'Status Badge', category: 'existing', configurable: false, description: 'Filled / Partial / Pending / Cancelled / Working pill.' },
  { id: 'colored-value', label: 'Coloured Value', category: 'existing', configurable: false, description: 'Numeric value coloured by sign.' },
  { id: 'oas-value', label: 'OAS Value', category: 'existing', configurable: false, description: 'OAS spread with > 80 warning threshold.' },
  { id: 'signed-value', label: 'Signed Value', category: 'existing', configurable: false, description: 'Numeric value with leading +/- prefix.' },
  { id: 'ticker', label: 'Ticker', category: 'existing', configurable: false, description: 'Bold cyan ticker symbol.' },
  { id: 'rating-badge', label: 'Rating Badge', category: 'existing', configurable: false, description: 'Credit-rating pill keyed by `rtgClass` on the row.' },
  { id: 'pnl-value', label: 'P&L Value', category: 'existing', configurable: false, description: 'P&L value with K suffix and sign colour.' },
  { id: 'filled-amount', label: 'Filled Amount', category: 'existing', configurable: false, description: 'Filled qty coloured green when full, amber when partial.' },
  { id: 'book-name', label: 'Book Name', category: 'existing', configurable: false, description: 'Cyan book-name text.' },
  { id: 'change-value', label: 'Change Value', category: 'existing', configurable: false, description: 'Index-style +/-N.NN change value.' },
  { id: 'ytd-value', label: 'YTD Value', category: 'existing', configurable: false, description: 'YTD string coloured by leading +/- prefix.' },
  { id: 'rfq-status', label: 'RFQ Status', category: 'existing', configurable: false, description: 'LIVE / DONE / STALE RFQ-status pill.' },
];

export const CELL_RENDERER_IDS: readonly string[] = CELL_RENDERERS.map((r) => r.id);

export function findCellRenderer(id: string | undefined): CellRendererEntry | undefined {
  return CELL_RENDERERS.find((r) => r.id === id);
}

/**
 * The stored shape, as the lab's `seeds/renderers.ts` writes it: the id on
 * `cellRendererId`, and the config wrapped in a `{ kind, config }` envelope on
 * `cellRendererConfig`. Both fields are needed — the transform reads the id to
 * pick the renderer and the envelope to pass its params.
 */
export interface RendererAssignment {
  cellRendererId: string;
  cellRendererConfig: { kind: string; config: Record<string, unknown> };
}

export type RendererResult =
  | { ok: true; value: RendererAssignment }
  | { ok: false; error: string };

export function normalizeRenderer(raw: unknown): RendererResult {
  const id = typeof raw === 'string' ? raw : (raw as { id?: unknown })?.id;
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'renderer must be a renderer id, or { "id": "...", "config": { ... } }.' };
  }
  const entry = findCellRenderer(id);
  if (!entry) {
    return {
      ok: false,
      error:
        `"${id}" is not a known cell renderer. Call list_cell_renderers for the catalogue. ` +
        `Valid ids: ${CELL_RENDERER_IDS.join(', ')}.`,
    };
  }

  const rawConfig = typeof raw === 'string' ? undefined : (raw as { config?: unknown }).config;
  if (rawConfig !== undefined && (typeof rawConfig !== 'object' || rawConfig === null || Array.isArray(rawConfig))) {
    return { ok: false, error: 'renderer.config must be an object — see get_feature_guide("cell-renderers").' };
  }
  const config = (rawConfig as Record<string, unknown> | undefined) ?? {};

  if (!entry.configurable && Object.keys(config).length > 0) {
    return {
      ok: false,
      error: `The "${id}" renderer takes no configuration — it styles itself from the cell value. Pass the id alone.`,
    };
  }

  return { ok: true, value: { cellRendererId: id, cellRendererConfig: { kind: id, config } } };
}
