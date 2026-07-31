import type { IFloatingFilterComp } from 'ag-grid-community';
import { BaseStreamSafeFilter } from './streamSafeFloatingFilterBase';

/**
 * Focus-aware floating filter with clear-button + comma-token OR matching.
 *
 * **Three responsibilities.**
 *
 * 1. **Streaming-data clobber defense.** AG-Grid Enterprise's
 *    `agMultiColumnFilter` floating-filter delegate calls
 *    `onParentModelChanged` on its first sub-filter's floating filter
 *    every time the parent's `onModelAsStringChange` event fires. The
 *    set sub-filter dispatches that event from its
 *    `syncAfterDataChange → updateAvailableKeys` path on every
 *    `applyTransactionAsync` tick — even when the *applied* model
 *    didn't change, only the discoverable values list. The default
 *    text floating filter's setValue(model) clobbers in-progress user
 *    input. We skip the write when the input has focus.
 *
 * 2. **Clear button.** A small ✕ button sits inside the input
 *    wrapper's right edge. It appears only when the input has a value
 *    and clicking it clears both the input and the underlying filter.
 *
 * 3. **Comma-token OR matching.** Typing `aaa,bbb,ccc` filters rows
 *    whose value contains ANY of those tokens. Implemented via
 *    AG-Grid's compound filter model
 *    (`{filterType, operator: 'OR', conditions: [...]}`) when 2+ non-
 *    empty tokens are present. Single token uses the simple model so
 *    the popup filter UI stays in sync. Whitespace around tokens is
 *    trimmed; empty tokens (e.g. trailing comma) are dropped.
 *
 * **DOM shape.** Matches AG-Grid 35.x's default text floating filter so
 * theme rules apply unchanged: `.ag-floating-filter-input` outer,
 * `.ag-input-wrapper` inner, `.ag-input-field-input.ag-text-field-input`
 * on the `<input>`. The clear button uses absolute positioning inside
 * the wrapper so it doesn't disturb input height — height matches the
 * default exactly.
 *
 * **Registered as `streamSafeText`** in `gridOptions.components` (see
 * `MarketsGrid.tsx`). Auto-applied to text/number sub-filters of
 * `agMultiColumnFilter` in `applyFilterConfigToColDef`. Set sub-filters
 * keep their built-in (read-only) floating filter — no clobber risk
 * there, and no typing affordance to add.
 */
export class StreamSafeTextFloatingFilter extends BaseStreamSafeFilter implements IFloatingFilterComp {
  protected placeholder(): string {
    return 'Filter (comma-separated)...';
  }

  /**
   * Push the user's typed value into the parent filter.
   *
   *   0 tokens     → clear all sub-filter slots (no filter applied)
   *   1 token      → text sub-filter `contains` (fuzzy substring search)
   *   2+ tokens    → set sub-filter `values: [...]` (exact-match list)
   *
   * Why set-filter for multi-token. The popup UI for compound text
   * conditions ("equals aaa OR equals bb OR equals cc …") gets unwieldy
   * at 3+ values. Set-filter naturally renders a checkbox list of
   * selected values — same applied behaviour, much cleaner popup. When
   * the column's multi-filter doesn't include a set sub-filter, fall
   * back to compound text (capped at `maxNumConditions` from the
   * filter's params; we lift that cap in the column-customization
   * transform layer).
   *
   * For standalone (non-multi) text columns, multi-token still uses
   * compound text — there's no set sub-filter to delegate to.
   */
  protected applyValue(rawValue: string): void {
    const tokens = rawValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '');

    const ctx = this.getColumnContext();
    const textIdxInDef = ctx.primaryIdx('agTextColumnFilter', 'agNumberColumnFilter');
    const hasSetSubFilter = ctx.setIdx >= 0;

    // ── 0 tokens → clear everything ───────────────────────────────
    if (tokens.length === 0) {
      if (ctx.isInsideMulti) {
        this.pushColumnModel(ctx.colId, this.buildMultiEnvelope(ctx.subFilters, {}));
      } else {
        this.pushStandaloneClear();
      }
      return;
    }

    // ── 1 token → text/number sub-filter `contains`/`equals` ──────
    if (tokens.length === 1) {
      const v = tokens[0];
      if (ctx.isInsideMulti) {
        // Determine text vs number from the colDef sub-filter slot.
        const textSubFilter = textIdxInDef >= 0 ? ctx.subFilters[textIdxInDef] : undefined;
        const isNumberSub = textSubFilter?.filter === 'agNumberColumnFilter';
        const filterTypeStr = isNumberSub ? 'number' : 'text';
        const op = isNumberSub ? 'equals' : 'contains';
        const filterValue = isNumberSub ? this.toNumber(v) : v;
        const slotModel = { filterType: filterTypeStr, type: op, filter: filterValue };
        // Clear set slot, plant text/number slot.
        this.pushColumnModel(
          ctx.colId,
          this.buildMultiEnvelope(ctx.subFilters, {
            [textIdxInDef >= 0 ? textIdxInDef : 0]: slotModel,
          }),
        );
      } else {
        this.params.parentFilterInstance((parent) => {
          const p = parent as {
            getFilterType?: () => string;
            onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
            setModel?: (m: unknown) => void;
          };
          const filterType = (typeof p.getFilterType === 'function' ? p.getFilterType() : 'text') ?? 'text';
          const singleOp = filterType === 'number' ? 'equals' : 'contains';
          if (typeof p.onFloatingFilterChanged === 'function') {
            p.onFloatingFilterChanged(singleOp, v);
          } else {
            p.setModel?.({
              filterType,
              type: singleOp,
              filter: filterType === 'number' ? this.toNumber(v) : v,
            });
          }
        });
      }
      return;
    }

    // ── 2+ tokens ─────────────────────────────────────────────────
    // Preferred path: set sub-filter `values: [...]`. Cleaner popup,
    // no maxNumConditions cap, exact-match semantics built in.
    if (ctx.isInsideMulti && hasSetSubFilter) {
      const setModel = { filterType: 'set', values: tokens };
      // Plant set slot, clear text slot (so the popup doesn't show
      // a stale text condition while the set is the active filter).
      this.pushColumnModel(
        ctx.colId,
        this.buildMultiEnvelope(ctx.subFilters, { [ctx.setIdx]: setModel }),
      );
      return;
    }

    // Fallback: compound text. Used when the multi has no set sub-
    // filter, or when the column is a standalone text filter (no
    // multi wrapper). maxNumConditions auto-lifted in transforms.
    const conditions = tokens.map((t) => ({
      filterType: 'text' as const,
      type: 'equals' as const,
      filter: t,
    }));
    const compoundTextModel: Record<string, unknown> = {
      filterType: 'text',
      operator: 'OR',
      conditions,
    };
    if (ctx.isInsideMulti) {
      this.pushColumnModel(
        ctx.colId,
        this.buildMultiEnvelope(ctx.subFilters, {
          [textIdxInDef >= 0 ? textIdxInDef : 0]: compoundTextModel,
        }),
      );
    } else {
      this.pushColumnModel(ctx.colId, compoundTextModel);
    }
  }

  private toNumber(s: string): number {
    return Number(s);
  }

  /**
   * Best-effort string rendering of the current applied model — for
   * displaying the active filter when the input doesn't have focus.
   * Handles the column-level multi shape (`{filterType: 'multi',
   * filterModels: [...]}`) by walking sub-filter slots and rendering
   * the first non-null one. Set sub-filter values render as a token
   * list so re-focusing the input shows what the user originally
   * typed; text/number conditions render the same way.
   */
  protected stringifyModel(model: unknown): string {
    if (typeof model === 'string') return model;
    if (model && typeof model === 'object') {
      const m = model as {
        filterType?: string;
        filterModels?: unknown[];
        filter?: unknown;
        operator?: string;
        conditions?: Array<{ filter?: unknown }>;
        values?: unknown[];
      };
      // Column-level mounting on agMultiColumnFilter: walk sub-filter
      // slots and render the first non-null model.
      if (m.filterType === 'multi' && Array.isArray(m.filterModels)) {
        for (const sub of m.filterModels) {
          if (sub == null) continue;
          const s = this.stringifyModel(sub);
          if (s) return s;
        }
        return '';
      }
      if (Array.isArray(m.values)) return m.values.join(', ');
      if (Array.isArray(m.conditions) && m.conditions.length > 0) {
        return m.conditions
          .map((c) => (c.filter == null ? '' : String(c.filter)))
          .filter((s) => s !== '')
          .join(', ');
      }
      if (typeof m.filter === 'string') return m.filter;
      if (typeof m.filter === 'number') return String(m.filter);
    }
    return '';
  }
}
