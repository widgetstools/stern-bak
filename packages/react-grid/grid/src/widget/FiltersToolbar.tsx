import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  useModuleState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
  Input,
  ChromeButton,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  Plus,
  Pencil,
  Trash2,
  FunnelX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreVertical,
} from 'lucide-react';
import { useFilterModel } from './useFilterModel';

/**
 * FiltersToolbar — pill-row UI for saved filter models.
 *
 * State, AG-Grid event wiring, and the saved-filters → AG-Grid push
 * pipeline live in `useFilterModel`. This component renders the chrome:
 * collapse/expand toggle, scrollable pill row, per-pill rename input,
 * per-pill details popover, and the sticky add/clear action cluster.
 */

/**
 * ToolbarVisibilityState is the per-profile key/value used to persist
 * collapse/expand state for the filter pill row. Imported inline (the
 * module's TS interface isn't on the public core barrel) so we don't
 * take a hard dep on the module's shape — only the boolean slot we
 * actually use.
 */
interface ToolbarVisibilityLike {
  visible: Record<string, boolean>;
}
const FILTERS_EXPANDED_KEY = 'filters-toolbar-pills';

/**
 * FiltersToolbar accepts no props — formatter-toolbar visibility is
 * handled by its own button in the primary row (MarketsGrid), decoupled
 * from the filter pill carousel.
 */
export type FiltersToolbarProps = Record<string, never>;

function FiltersToolbarInner() {
  const model = useFilterModel();
  const { filters, filterCounts, hasNewFilter } = model;

  // Persisted collapse/expand state — piggy-backs on the
  // `toolbar-visibility` module that ships in every profile. Missing key
  // defaults to EXPANDED so existing profiles get the familiar layout.
  const [tbvState, setTbvState] = useModuleState<ToolbarVisibilityLike>('toolbar-visibility');
  const expanded = tbvState?.visible?.[FILTERS_EXPANDED_KEY] !== false;
  const toggleExpanded = useCallback(() => {
    setTbvState((prev) => ({
      ...prev,
      visible: {
        ...(prev?.visible ?? {}),
        [FILTERS_EXPANDED_KEY]: !(prev?.visible?.[FILTERS_EXPANDED_KEY] !== false),
      },
    }));
  }, [setTbvState]);

  const [renameId, setRenameId] = useState<string | null>(null);
  // Pill whose details/edit popover is currently open. Controlled so the
  // "Save" button can close the popover programmatically after a successful
  // commit.
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

  const handleConfirmRename = useCallback(
    (id: string, label: string) => {
      model.rename(id, label);
      setRenameId(null);
    },
    [model],
  );

  const renameInputRef = useRef<HTMLInputElement>(null);

  // ─── Scroll overflow chrome ─────────────────────────────────────────────
  // Show left/right chevrons when the pill row overflows its container so
  // the hidden pills are discoverable. Pure UI — no coupling to rowData or
  // grid state.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Stable handler reading scrollRef only — empty deps guarantee identity
  // is constant across renders so the mount-once observer effect below
  // never tears down + re-attaches mid-session (which would stack listeners
  // on every drift in this callback's deps).
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft((prev) => (prev ? false : prev));
      setCanScrollRight((prev) => (prev ? false : prev));
      return;
    }
    const nextLeft = el.scrollLeft > 2;
    const nextRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setCanScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight((prev) => (prev === nextRight ? prev : nextRight));
  }, []);
  // Bridge the stable callback through a ref so the observer effect can
  // call the current implementation without listing the callback in deps.
  // Belt-and-braces: if updateScrollState's deps ever grow, the observer
  // effect's `[]` deps still hold and the listener never re-attaches.
  const updateScrollStateRef = useRef(updateScrollState);
  updateScrollStateRef.current = updateScrollState;

  useEffect(() => {
    updateScrollState();
  }, [filters, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => updateScrollStateRef.current();
    el.addEventListener('scroll', handler, { passive: true });
    const ro = new ResizeObserver(handler);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', handler); ro.disconnect(); };
    // Reason: handler proxies through updateScrollStateRef so the effect
    // owns its listeners for the entire component lifetime — listing the
    // callback would re-attach on every render where its identity drifted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollBy = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  const activeCount = filters.filter((f) => f.active).length;
  const canClearFilters = activeCount > 0;

  return (
    <div
      className="ds-toolbar-content ds-filters-bar"
      data-testid="filters-toolbar"
      data-expanded={expanded ? 'true' : 'false'}
    >
      {/* Collapse / expand toggle — leads the row so it's the first thing
          the user sees. Flips between ChevronUp (expanded) and
          ChevronDown (collapsed); persists through the
          toolbar-visibility module. */}
      <ChromeButton
        type="button"
        className="ds-filters-collapse"
        onClick={toggleExpanded}
        title={expanded ? 'Collapse filter pills' : 'Expand filter pills'}
        aria-expanded={expanded}
        data-testid="filters-collapse-toggle"
      >
        {expanded ? (
          <ChevronsLeft size={18} strokeWidth={3} />
        ) : (
          <ChevronsRight size={18} strokeWidth={3} />
        )}
      </ChromeButton>

      {/* Collapsed view — compact summary chip replaces the pill row.
          Click it to re-expand (in addition to the chevron). */}
      {!expanded && (
        <ChromeButton
          type="button"
          className="ds-filters-summary"
          onClick={toggleExpanded}
          data-testid="filters-summary-chip"
          title="Click to expand filter pills"
        >
          {filters.length === 0 ? (
            <span className="ds-filters-summary-empty">No filters</span>
          ) : (
            <>
              <span className="ds-filters-summary-count">
                {filters.length}
              </span>
              <span className="ds-filters-summary-label">
                filter{filters.length === 1 ? '' : 's'}
              </span>
              {activeCount > 0 && (
                <span className="ds-filters-summary-active">
                  · {activeCount} active
                </span>
              )}
            </>
          )}
        </ChromeButton>
      )}

      {expanded && canScrollLeft && (
        <ChromeButton
          type="button"
          className="ds-filters-caret"
          onClick={() => scrollBy(-1)}
          title="Scroll left"
          data-testid="filters-caret-left"
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
        </ChromeButton>
      )}
      {expanded && (
      <div ref={scrollRef} className="ds-filter-scroll">
        {filters.map((f) => {
          if (renameId === f.id) {
            return (
              <Input
                key={f.id}
                ref={renameInputRef}
                defaultValue={f.label}
                autoFocus
                className="ds-filter-rename-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename(f.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setRenameId(null);
                }}
                onBlur={(e) => handleConfirmRename(f.id, e.target.value)}
              />
            );
          }
          return (
            <div
              key={f.id}
              className={`ds-filter-pill group ${f.active ? 'ds-filter-active' : 'ds-filter-inactive'}`}
              data-testid={`filter-pill-${f.id}`}
              data-active={f.active}
            >
              <ChromeButton
                type="button"
                className="ds-filter-pill-btn"
                onClick={() => model.toggle(f.id)}
                title={
                  filterCounts[f.id] != null
                    ? `${f.label} — matches ${filterCounts[f.id]} row${filterCounts[f.id] === 1 ? '' : 's'}`
                    : f.label
                }
              >
                <span className="truncate">{f.label}</span>
                {filterCounts[f.id] != null && (
                  <span
                    className="ds-filter-pill-count"
                    data-testid={`filter-pill-count-${f.id}`}
                  >
                    {filterCounts[f.id]}
                  </span>
                )}
              </ChromeButton>
              <span className="ds-filter-pill-actions">
                <ChromeButton
                  type="button"
                  className="ds-filter-pill-action"
                  onClick={(e) => { e.stopPropagation(); setRenameId(f.id); }}
                  title="Rename"
                >
                  <Pencil size={9} strokeWidth={1.75} />
                </ChromeButton>
                <ChromeButton
                  type="button"
                  className="ds-filter-pill-action ds-filter-pill-action-remove"
                  onClick={(e) => { e.stopPropagation(); model.remove(f.id); }}
                  title="Remove"
                >
                  <Trash2 size={9} strokeWidth={1.75} />
                </ChromeButton>
              </span>
              <Popover
                open={openDetailsId === f.id}
                onOpenChange={(o) => setOpenDetailsId(o ? f.id : null)}
              >
                <PopoverTrigger asChild>
                  <ChromeButton
                    type="button"
                    className="ds-filter-pill-menu"
                    onClick={(e) => e.stopPropagation()}
                    title="Edit saved filter"
                    data-testid={`filter-pill-menu-${f.id}`}
                  >
                    <MoreVertical size={11} strokeWidth={2} />
                  </ChromeButton>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                  className="w-[360px] p-0 text-xs"
                  data-testid={`filter-pill-details-${f.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <FilterModelEditor
                    label={f.label}
                    filterModel={f.filterModel as Record<string, unknown>}
                    onSave={(next) => {
                      model.editFilterModel(f.id, next);
                      setOpenDetailsId(null);
                    }}
                    onCancel={() => setOpenDetailsId(null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>
      )}
      {expanded && canScrollRight && (
        <ChromeButton
          type="button"
          className="ds-filters-caret"
          onClick={() => scrollBy(1)}
          title="Scroll right"
          data-testid="filters-caret-right"
        >
          <ChevronRight size={12} strokeWidth={2.5} />
        </ChromeButton>
      )}

      {/* Sticky action cluster — always visible even when the pill row
          scrolls OR is collapsed. Clear + add remain reachable so the
          user can manage pills from the compact view too.
          `.ds-filters-actions` is a flex-shrink:0 group; the
          Brush / formatter-toolbar toggle no longer lives here — it
          sits in the primary row's right-side action cluster
          (MarketsGrid) where it's decoupled from filter semantics. */}
      <div className="ds-filters-actions">
        {filters.length > 0 && (
          <ChromeButton
            type="button"
            className="ds-filters-clear-btn"
            onClick={model.deactivateAll}
            disabled={!canClearFilters}
            data-enabled={canClearFilters ? 'true' : 'false'}
            title={
              canClearFilters
                ? 'Clear all filters'
                : 'All saved filters are already inactive'
            }
            data-testid="filters-clear-btn"
          >
            <FunnelX size={18} strokeWidth={3} />
          </ChromeButton>
        )}

        <ChromeButton
          type="button"
          className="ds-filters-add-btn"
          onClick={model.addFromLive}
          disabled={!hasNewFilter}
          data-testid="filters-add-btn"
          data-enabled={hasNewFilter ? 'true' : 'false'}
          title={
            hasNewFilter
              ? 'Capture current filter as a new pill'
              : 'Add a column filter (that isn’t already saved) to enable'
          }
        >
          <Plus size={18} strokeWidth={3} />
        </ChromeButton>
      </div>
    </div>
  );
}

export const FiltersToolbar = memo(FiltersToolbarInner);

/**
 * Inline JSON editor for a saved filter's `filterModel`. Lives inside
 * the per-pill PopoverContent. PopoverContent unmounts on close, so the
 * draft state here resets each time the popover is reopened.
 *
 * Validates JSON.parse on every keystroke and only enables Save when the
 * draft both parses AND yields a non-array object. AG-Grid filter models
 * are always plain objects keyed by colId.
 */
interface FilterModelEditorProps {
  label: string;
  filterModel: Record<string, unknown>;
  onSave: (model: Record<string, unknown>) => void;
  onCancel: () => void;
}
function FilterModelEditor({ label, filterModel, onSave, onCancel }: FilterModelEditorProps) {
  const initial = useMemo(() => JSON.stringify(filterModel, null, 2), [filterModel]);
  const [draft, setDraft] = useState(initial);

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(draft);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false as const, error: 'Filter model must be a JSON object' };
      }
      return { ok: true as const, value: value as Record<string, unknown> };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }, [draft]);

  const dirty = draft !== initial;
  const canSave = parsed.ok && dirty;

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-[color:var(--ds-border-primary)] text-[10px] font-bold uppercase tracking-wider opacity-60">
        {label}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={10}
        className="font-mono text-[11px] leading-snug rounded-none border-0 border-b border-[color:var(--ds-border-primary)] resize-none focus-visible:ring-0 focus-visible:ring-offset-0 max-h-[280px]"
        data-testid="filter-pill-details-textarea"
      />
      {!parsed.ok && (
        <div
          className="px-3 py-1.5 text-[10px] font-medium border-b border-[color:var(--ds-border-primary)] text-[color:var(--ds-accent-negative)]"
          data-testid="filter-pill-details-error"
        >
          {parsed.error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={() => parsed.ok && onSave(parsed.value)}
          data-testid="filter-pill-details-save"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
