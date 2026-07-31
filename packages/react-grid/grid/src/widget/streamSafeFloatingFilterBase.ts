/**
 * BaseStreamSafeFilter — shared scaffolding for stream-safe floating filters.
 *
 * The three concrete filters (text / number / date) all repeat:
 *  - same private fields (input, params, debounce timer, …)
 *  - identical `init`/`getGui`/`destroy`/`onParentModelChanged` skeletons
 *  - identical `onInput` debounce + `onClearMouseDown` clear-on-click
 *  - same boilerplate for extracting `column` / `colDef` / `api` off the
 *    untyped `IFloatingFilterParams` (the `as unknown as { … }` casts)
 *  - same `pushColumnModel` / `buildMultiEnvelope` helpers
 *
 * This module owns all of that. Subclasses provide three template-method
 * hooks (`placeholder()`, `applyValue()`, `stringifyModel()`) plus an
 * optional `onInit()` for reading subclass-specific params (e.g. the date
 * filter's `dateLocale`).
 *
 * Internal — not exported from the package barrel.
 */

import type {
  IFloatingFilterComp,
  IFloatingFilterParams,
} from 'ag-grid-community';
import { buildFloatingFilterDom } from './streamSafeFloatingFilterDom';

// ─── Typed param helpers ────────────────────────────────────────────────
//
// AG-Grid's IFloatingFilterParams type intentionally doesn't expose
// `column` or `api` because those are runtime concerns. We need them.
// `getParamField` keeps the cast surface to ONE place per logical lookup
// instead of the 5× `as unknown as { … }` repetition the review flagged.

/** Type-safe read of an arbitrary field off an opaque AG-Grid params object. */
export function readParamField<T>(params: IFloatingFilterParams, key: string): T | undefined {
  return (params as unknown as Record<string, unknown>)[key] as T | undefined;
}

/** AG-Grid column proxy carrying enough surface for our routing logic. */
export interface ColumnProxy {
  getColId?: () => string;
  getColDef?: () => {
    filter?: unknown;
    filterParams?: { filters?: Array<{ filter?: string } | undefined> };
  };
}

/** Subset of AG-Grid's GridApi we use for column-level filter pushes. */
export interface ColumnFilterApi {
  setColumnFilterModel?: (col: string, model: unknown) => Promise<void> | void;
  getColumnFilterModel?: <T = unknown>(col: string) => T | null | undefined;
  onFilterChanged?: () => void;
}

/** Parent floating-filter handle (the wrapped sub-filter for compound shapes). */
export interface ParentFilterHandle {
  getFilterType?: () => string;
  onFloatingFilterChanged?: (type: string | null, value: string | null) => void;
  setModel?: (m: unknown) => void;
}

/** Snapshot of the column-shape context routing decisions need. */
export interface ColumnContext {
  colId: string | undefined;
  isInsideMulti: boolean;
  subFilters: Array<{ filter?: string } | undefined>;
  setIdx: number;
  /** Index of the first sub-filter matching any of the supplied AG-Grid
   *  filter names — text/number filters look for text-or-number; date
   *  filters look for date. -1 when not found. */
  primaryIdx: (...names: string[]) => number;
}

export function readColumnContext(params: IFloatingFilterParams): ColumnContext {
  const col = readParamField<ColumnProxy>(params, 'column');
  const colId = col?.getColId?.();
  const colDef = col?.getColDef?.();
  const isInsideMulti = colDef?.filter === 'agMultiColumnFilter';
  const subFilters = colDef?.filterParams?.filters ?? [];
  const setIdx = isInsideMulti
    ? subFilters.findIndex((f) => f?.filter === 'agSetColumnFilter')
    : -1;
  const primaryIdx = (...names: string[]): number => {
    if (!isInsideMulti) return -1;
    return subFilters.findIndex((f) => !!f?.filter && names.includes(f.filter));
  };
  return { colId, isInsideMulti, subFilters, setIdx, primaryIdx };
}

/** Build the AG-Grid `{ filterType: 'multi', filterModels: [...] }`
 *  envelope. Entries map slot-index → sub-filter model; absent slots
 *  default to null (= no filter at that slot). */
export function buildMultiEnvelope(
  subFilters: ReadonlyArray<unknown>,
  entries: Record<number, unknown>,
): unknown {
  const filterModels: unknown[] = [];
  for (let i = 0; i < subFilters.length; i++) {
    filterModels[i] = entries[i] ?? null;
  }
  return { filterType: 'multi', filterModels };
}

/** Push a column-level filter model via the v34+ api, then trigger
 *  filterChanged. Falls back to the deprecated `parent.setModel(...)`
 *  path when the api isn't available (shouldn't happen in our v35 stack
 *  but the safety net prevents data loss on a future api shape change). */
export function pushColumnModel(
  params: IFloatingFilterParams,
  colId: string | undefined,
  model: unknown,
): void {
  const api = readParamField<ColumnFilterApi>(params, 'api');
  if (!api?.setColumnFilterModel || !colId) {
    params.parentFilterInstance((parent) => {
      (parent as ParentFilterHandle).setModel?.(model);
    });
    return;
  }
  const result = api.setColumnFilterModel(colId, model);
  const trigger = () => api.onFilterChanged?.();
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    (result as Promise<unknown>).then(trigger);
  } else {
    trigger();
  }
}

/** Clear the standalone (non-multi) filter via parent — prefers the
 *  `onFloatingFilterChanged` channel so AG-Grid stays in sync; falls
 *  back to `setModel(null)` when that hook isn't exposed. */
export function pushStandaloneClear(params: IFloatingFilterParams): void {
  params.parentFilterInstance((parent) => {
    const p = parent as ParentFilterHandle;
    if (typeof p.onFloatingFilterChanged === 'function') {
      p.onFloatingFilterChanged(null, null);
    } else {
      p.setModel?.(null);
    }
  });
}

// ─── Base class ─────────────────────────────────────────────────────────

export abstract class BaseStreamSafeFilter implements IFloatingFilterComp {
  protected eGui!: HTMLDivElement;
  protected input!: HTMLInputElement;
  protected clearBtn!: HTMLButtonElement;
  protected params!: IFloatingFilterParams;
  protected debounceMs = 250;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  protected syncClearVisibilityFn!: () => void;
  /** Last user-typed value — used to render the input on refocus when
   *  the applied model is too lossy to stringify back. Off by default
   *  (text filter doesn't need it); date/number subclasses opt in via
   *  `trackLastTyped()`. */
  protected lastTyped = '';

  /** Required: the placeholder shown in the empty input. */
  protected abstract placeholder(): string;

  /** Required: route the user's typed value into AG-Grid. */
  protected abstract applyValue(rawValue: string): void;

  /** Required: render an applied model back to a display string. */
  protected abstract stringifyModel(model: unknown): string;

  /** Optional: read subclass-specific params (e.g. dateLocale). */
  protected onInit(_params: IFloatingFilterParams): void {
    /* default: no extra setup */
  }

  /** Whether to track lastTyped for refocus rendering. Default false —
   *  text filter just reuses the applied model verbatim. */
  protected trackLastTyped(): boolean {
    return false;
  }

  init(params: IFloatingFilterParams): void {
    this.params = params;
    this.debounceMs = readParamField<number>(params, 'debounceMs') ?? 250;
    this.onInit(params);
    const dom = buildFloatingFilterDom({
      placeholder: this.placeholder(),
      onInput: this.onInput,
      onClearMouseDown: this.onClearMouseDown,
    });
    this.eGui = dom.eGui;
    this.input = dom.input;
    this.clearBtn = dom.clearBtn;
    this.syncClearVisibilityFn = dom.syncClearVisibility;
  }

  onParentModelChanged(parentModel: unknown): void {
    // Streaming clobber defence — don't overwrite mid-typing input.
    if (document.activeElement === this.input) return;
    if (parentModel == null) {
      this.input.value = '';
      this.lastTyped = '';
    } else if (this.trackLastTyped()) {
      this.input.value = this.lastTyped || this.stringifyModel(parentModel);
    } else {
      this.input.value = this.stringifyModel(parentModel);
    }
    this.syncClearVisibilityFn();
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  destroy(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.input.removeEventListener('input', this.onInput);
    this.clearBtn.removeEventListener('mousedown', this.onClearMouseDown);
  }

  protected readonly onInput = (): void => {
    this.syncClearVisibilityFn();
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      if (this.trackLastTyped()) this.lastTyped = this.input.value;
      this.applyValue(this.input.value);
    }, this.debounceMs);
  };

  protected readonly onClearMouseDown = (e: MouseEvent): void => {
    // Prevent the button from stealing focus (would break our focus-aware
    // skip in onParentModelChanged the next time data ticks).
    e.preventDefault();
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.input.value = '';
    if (this.trackLastTyped()) this.lastTyped = '';
    this.syncClearVisibilityFn();
    this.applyValue('');
    this.input.focus();
  };

  // ─── Shared infrastructure subclasses' applyValue() can call ────────

  protected getColumnContext(): ColumnContext {
    return readColumnContext(this.params);
  }

  protected pushColumnModel(colId: string | undefined, model: unknown): void {
    pushColumnModel(this.params, colId, model);
  }

  protected pushStandaloneClear(): void {
    pushStandaloneClear(this.params);
  }

  protected buildMultiEnvelope(
    subFilters: ReadonlyArray<unknown>,
    entries: Record<number, unknown>,
  ): unknown {
    return buildMultiEnvelope(subFilters, entries);
  }
}
