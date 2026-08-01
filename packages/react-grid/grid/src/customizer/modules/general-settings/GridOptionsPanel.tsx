/**
 * Grid Options settings panel — v5 sidebar-nav edition.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Grid Options                       [RESET]  [SAVE]   │   title row
 *   ├──────────────────────────────────────────────────────┤
 *   │ 🔍 Filter options…                              [X]  │   search
 *   ├──────────────────────────────────────────────────────┤
 *   │ [SCHEMA v2] [OVERRIDES 4/87] [DIRTY ●] [FILTER --]   │   sticky summary chips
 *   ├──────────────┬───────────────────────────────────────┤
 *   │ 01 ESSENT.   │ ESSENTIALS                            │
 *   │ 02 GROUPING ●│ ... fields ...                        │
 *   │ 03 PIVOT     │                                       │
 *   │  ...         │                                       │
 *   └──────────────┴───────────────────────────────────────┘
 *
 * - Sidebar lists every band; click scrolls it into view, active band
 *   is highlighted, and a small chip badge counts non-default fields per
 *   band so the user can scan for "what did I touch?" at a glance.
 * - Summary chips sit between the search bar and the body so they stay
 *   visible while the content scrolls.
 * - Content area drops the in-line `<Band>` header (the sidebar
 *   identifies the section) but keeps a slim "NN — TITLE" anchor strip
 *   per band so scroll context is unambiguous.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CircleDot,
  Filter,
  Layers,
  RotateCcw,
  Save,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import {
  IconInput,
  ObjectTitleRow,
  SharpBtn,
  SummaryChip,
  type SummaryChipTone,
} from '../../ui/SettingsPanel';
import { cn } from '@wellsfargo-starui/react';
import { ChromeButton } from '../../ui/ChromeButton';
import {
  FieldRenderer,
  collectFieldKeys,
  filterBand,
  type BandSchema,
  type Field,
} from './fieldSchema';
import { GRID_OPTIONS_SCHEMA } from './gridOptionsSchema';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';

const MODULE_ID = 'general-settings';

/**
 * Custom-field state-key mapping — the two `kind: 'custom'` fields in
 * the schema (PAGE SIZE, UNDO / REDO) wrap multiple state keys behind a
 * single row, so the generic `collectFieldKeys` walker can't reach them.
 * Listed here so per-band override counts stay honest.
 */
const CUSTOM_FIELD_STATE_KEYS: Record<
  string,
  ReadonlyArray<keyof GeneralSettingsState>
> = {
  'go-page-size-row': ['paginationPageSize', 'paginationAutoPageSize'],
  'go-undo-redo-row': ['undoRedoCellEditing', 'undoRedoCellEditingLimit'],
  'go-cell-change-flash-color': ['cellChangeFlashColor'],
};

function collectCustomKeys(
  fields: ReadonlyArray<Field>,
): Array<keyof GeneralSettingsState> {
  const out: Array<keyof GeneralSettingsState> = [];
  for (const f of fields) {
    if (f.kind === 'subsection' || f.kind === 'conditional') {
      out.push(...collectCustomKeys(f.fields));
    } else if (f.kind === 'custom') {
      const keys = CUSTOM_FIELD_STATE_KEYS[f.testId];
      if (keys) out.push(...keys);
    }
  }
  return out;
}

function countBandOverrides(
  band: BandSchema,
  state: GeneralSettingsState,
): number {
  const keys = new Set<keyof GeneralSettingsState>([
    ...collectFieldKeys(band.fields),
    ...collectCustomKeys(band.fields),
  ]);
  let n = 0;
  for (const k of keys) {
    if (state[k] !== INITIAL_GENERAL_SETTINGS[k]) n++;
  }
  return n;
}

function countBandFieldKeys(band: BandSchema): number {
  return new Set<keyof GeneralSettingsState>([
    ...collectFieldKeys(band.fields),
    ...collectCustomKeys(band.fields),
  ]).size;
}

const TOTAL_TRACKED_KEYS: number = GRID_OPTIONS_SCHEMA.reduce(
  (sum, b) => sum + countBandFieldKeys(b),
  0,
);

function countNonDefault(s: GeneralSettingsState): number {
  let n = 0;
  for (const key of Object.keys(INITIAL_GENERAL_SETTINGS) as Array<
    keyof GeneralSettingsState
  >) {
    if (s[key] !== INITIAL_GENERAL_SETTINGS[key]) n++;
  }
  return n;
}

// ─── Progressive band mounting ──────────────────────────────────────
//
// Mounting all ~13 bands (~92 Radix controls) in one commit is what made
// the settings drawer janky to open — the commit landed mid slide-in
// animation. Instead, the first commit mounts only the bands that can be
// on screen; the rest fill in one-per-idle-slice right after. Off-screen
// placeholders keep the scrollbar + scrollIntoView targets stable.
//
// `requestIdleCallback` is the gate: where it's missing (jsdom tests),
// everything mounts up front so sync assertions keep working.

const IDLE_MOUNT_SUPPORTED =
  typeof requestIdleCallback === 'function' &&
  typeof cancelIdleCallback === 'function';

/** Bands mounted in the very first commit (≈ what fits one viewport). */
const INITIAL_MOUNTED_BANDS = 3;

/** Schema position per band index ('01' → 0, …) for the mount gate. */
const BAND_POSITION: ReadonlyMap<string, number> = new Map(
  GRID_OPTIONS_SCHEMA.map((b, i) => [b.index, i]),
);

// ─── Sidebar nav item ───────────────────────────────────────────────

interface BandNavItemProps {
  band: BandSchema;
  active: boolean;
  overrides: number;
  onClick: () => void;
}

function BandNavItem({ band, active, overrides, onClick }: BandNavItemProps) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      data-testid={`go-nav-${band.index}`}
      className={cn(
        'group w-full h-control-sm flex items-center gap-2 pl-2.5 pr-2 text-left rounded-sm transition-colors',
        'border-l-2 transition-colors',
        active
          ? 'bg-[var(--ds-primary-soft)] border-l-[color:var(--ds-primary)] text-foreground'
          : 'border-l-transparent text-foreground/90 hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'font-mono tabular-nums text-[10px] leading-none w-5 shrink-0',
          active ? 'text-[color:var(--ds-primary)]' : 'opacity-70',
        )}
      >
        {band.index}
      </span>
      <span className="flex-1 min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] leading-tight">
        {band.title}
      </span>
      {overrides > 0 && (
        <span
          aria-label={`${overrides} override${overrides === 1 ? '' : 's'}`}
          className="font-mono tabular-nums text-[9px] leading-none px-1 py-0.5 rounded-sm bg-[var(--ds-overlay-warning-soft)] text-[color:var(--ds-accent-warning)] border border-[color:var(--ds-overlay-warning-ring)]"
        >
          {overrides}
        </span>
      )}
    </ChromeButton>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────

export const GridOptionsPanel = memo(function GridOptionsPanel() {
  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    GeneralSettingsState,
    GeneralSettingsState
  >({
    moduleId: MODULE_ID,
    itemId: '__singleton__',
    selectItem: (state) => state ?? INITIAL_GENERAL_SETTINGS,
    commitItem: (next) => () => next,
  });

  const update = <K extends keyof GeneralSettingsState>(
    key: K,
    value: GeneralSettingsState[K],
  ): void => {
    setDraft({ [key]: value } as Partial<GeneralSettingsState>);
  };

  const [query, setQuery] = useState('');
  const [activeBand, setActiveBand] = useState<string>(
    GRID_OPTIONS_SCHEMA[0]?.index ?? '01',
  );

  // Progressive band mounting — see the IDLE_MOUNT_SUPPORTED note above.
  const [mountedBands, setMountedBands] = useState(
    IDLE_MOUNT_SUPPORTED ? INITIAL_MOUNTED_BANDS : GRID_OPTIONS_SCHEMA.length,
  );
  // Bands force-mounted out of order (sidebar nav jump to a band the
  // idle sweep hasn't reached yet).
  const [forcedBands, setForcedBands] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!IDLE_MOUNT_SUPPORTED) return;
    if (mountedBands >= GRID_OPTIONS_SCHEMA.length) return;
    const id = requestIdleCallback(
      () => setMountedBands((n) => n + 1),
      // Cap the wait so a busy main thread (streaming grid) can't stall
      // the sweep indefinitely.
      { timeout: 200 },
    );
    return () => cancelIdleCallback(id);
  }, [mountedBands]);

  const isBandMounted = useCallback(
    (index: string): boolean => {
      if (query) return true; // filtering must surface matches everywhere
      if (forcedBands.has(index)) return true;
      const pos = BAND_POSITION.get(index) ?? 0;
      return pos < mountedBands;
    },
    [query, forcedBands, mountedBands],
  );

  const filteredBands = useMemo(
    () =>
      GRID_OPTIONS_SCHEMA.map((b) => filterBand(b, query)).filter(
        (b): b is BandSchema => b != null,
      ),
    [query],
  );

  // Per-band override counts — always computed against the FULL schema
  // so the sidebar badges don't blink in/out when the user types in the
  // filter (filtered-out bands keep their count for context).
  const overridesByBand = useMemo(() => {
    const m: Record<string, number> = {};
    for (const band of GRID_OPTIONS_SCHEMA) {
      m[band.index] = countBandOverrides(band, draft);
    }
    return m;
  }, [draft]);

  const totalOverrides = useMemo(() => countNonDefault(draft), [draft]);

  // Scroll-into-view target refs, keyed by band index. Re-created on
  // every render — the Map is local, the entries are repopulated by the
  // ref callbacks on each render of `filteredBands`.
  const bandRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeBandRef = useRef(activeBand);
  activeBandRef.current = activeBand;

  const scrollToBand = useCallback((index: string) => {
    // Make sure the target band's fields exist before jumping to it, so
    // the user never lands on an empty placeholder.
    setForcedBands((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    const el = bandRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveBand(index);
  }, []);

  // If the filter narrows down to bands that no longer include the
  // active one, pick the first remaining band so the sidebar always
  // highlights a real entry.
  useEffect(() => {
    if (filteredBands.length === 0) return;
    if (!filteredBands.some((b) => b.index === activeBand)) {
      setActiveBand(filteredBands[0].index);
    }
  }, [filteredBands, activeBand]);

  // Passive scroll tracking via IntersectionObserver — guarded for
  // jsdom (the test setup doesn't shim it). The "topmost intersecting"
  // entry wins, with a generous top inset so a band becomes active as
  // soon as its header crosses ~10% from the top of the viewport.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible.length > 0) {
          const idx = visible[0].target.getAttribute('data-band-index');
          if (idx && idx !== activeBandRef.current) setActiveBand(idx);
        }
      },
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const [, el] of bandRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [filteredBands]);

  if (missing) return null;

  const dirtyTone: SummaryChipTone = dirty ? 'warning' : 'neutral';
  const filterActive = draft.quickFilterText.length > 0;
  const filterTone: SummaryChipTone = filterActive ? 'info' : 'neutral';
  const overridesTone: SummaryChipTone = totalOverrides > 0 ? 'warning' : 'neutral';

  return (
    <div
      data-testid="go-panel"
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      {/* Title row */}
      <div className="shrink-0 bg-background border-b border-border">
        <ObjectTitleRow
          title={
            <span className="text-xs font-semibold text-foreground">
              Grid Options
            </span>
          }
          actions={
            <>
              <SharpBtn
                variant="ghost"
                disabled={!dirty}
                onClick={discard}
                data-testid="go-discard-btn"
                title="Revert unsaved changes"
              >
                <RotateCcw size={13} strokeWidth={2} /> RESET
              </SharpBtn>
              <SharpBtn
                variant={dirty ? 'action' : 'ghost'}
                disabled={!dirty}
                onClick={save}
                data-testid="go-save-btn"
                title="Save grid options"
              >
                <Save size={13} strokeWidth={2} /> SAVE
              </SharpBtn>
            </>
          }
        />
      </div>

      {/* Search bar */}
      <div className="shrink-0 px-4 py-1.5 bg-[var(--ds-surface-ground)] border-b border-border flex items-center gap-2">
        <IconInput
          value={query}
          onChange={setQuery}
          onCommit={setQuery}
          icon={<Search size={12} strokeWidth={2} />}
          placeholder="Filter options…"
          aria-label="Filter grid options"
          data-testid="go-filter-input"
          className="flex-1"
        />
        {query && (
          <SharpBtn
            variant="ghost"
            onClick={() => setQuery('')}
            data-testid="go-filter-clear"
            title="Clear filter"
          >
            <X size={12} strokeWidth={2} />
          </SharpBtn>
        )}
      </div>

      {/* Sticky summary chip strip — pinned below the search bar */}
      <div
        data-testid="go-summary-strip"
        className="shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap"
      >
        <SummaryChip
          icon={<Layers size={11} strokeWidth={2} />}
          label="SCHEMA"
          value="v2"
          tone="neutral"
          title="Grid options schema version"
        />
        <SummaryChip
          icon={<Sliders size={11} strokeWidth={2} />}
          label="OVERRIDES"
          value={
            <>
              {totalOverrides}
              <span className="opacity-50 px-0.5">/</span>
              {TOTAL_TRACKED_KEYS}
            </>
          }
          tone={overridesTone}
          title={`${totalOverrides} of ${TOTAL_TRACKED_KEYS} options differ from defaults`}
          data-testid="go-summary-overrides"
        />
        <SummaryChip
          icon={<CircleDot size={11} strokeWidth={2} />}
          label="DIRTY"
          value={dirty ? 'YES' : '—'}
          tone={dirtyTone}
          title={dirty ? 'Unsaved changes' : 'No pending changes'}
          data-testid="go-summary-dirty"
        />
        <SummaryChip
          icon={<Filter size={11} strokeWidth={2} />}
          label="QUICK FILTER"
          value={
            filterActive ? (
              <span className="max-w-[140px] truncate inline-block align-middle">
                {draft.quickFilterText}
              </span>
            ) : (
              '—'
            )
          }
          tone={filterTone}
          title={
            filterActive
              ? `Quick filter: "${draft.quickFilterText}"`
              : 'No quick filter applied'
          }
          data-testid="go-summary-filter"
        />
        {query && (
          <SummaryChip
            icon={<Search size={11} strokeWidth={2} />}
            label="SEARCHING"
            value={
              <span className="max-w-[140px] truncate inline-block align-middle">
                {query}
              </span>
            }
            tone="primary"
            title={`Showing options matching "${query}"`}
            data-testid="go-summary-search"
          />
        )}
      </div>

      {/* Body — sidebar + scrollable content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <aside
          data-testid="go-band-nav"
          className="shrink-0 w-[176px] border-r border-border bg-[var(--ds-surface-ground)] overflow-y-auto py-1.5"
        >
          <nav className="flex flex-col gap-px px-1">
            {(filteredBands.length === 0
              ? GRID_OPTIONS_SCHEMA
              : filteredBands
            ).map((band) => (
              <BandNavItem
                key={band.index}
                band={band}
                active={activeBand === band.index}
                overrides={overridesByBand[band.index] ?? 0}
                onClick={() => scrollToBand(band.index)}
              />
            ))}
          </nav>
        </aside>

        <div
          ref={scrollRef}
          className="flex-1 min-w-0 overflow-y-auto pb-6"
        >
          {filteredBands.length === 0 ? (
            <div
              data-testid="go-filter-empty"
              className="px-6 py-8 text-center text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
            >
              No options match "{query}"
            </div>
          ) : (
            filteredBands.map((band) => (
              <section
                key={band.index}
                ref={(el) => {
                  if (el) bandRefs.current.set(band.index, el);
                  else bandRefs.current.delete(band.index);
                }}
                data-band-index={band.index}
                data-testid={`go-section-${band.index}`}
                className="px-5 pt-3 pb-1"
                // Skip rendering work for off-screen bands (~100 controls
                // across ~13 sections; only 1-2 are in the viewport when
                // the sheet opens). The intrinsic-size placeholder keeps
                // the scrollbar and scrollIntoView targets stable; the
                // browser renders each band as it scrolls into view.
                style={{
                  contentVisibility: 'auto',
                  containIntrinsicSize: 'auto 480px',
                }}
              >
                <header className="flex items-center gap-2.5 mb-2 select-none">
                  <span className="font-mono tabular-nums text-[10px] text-muted-foreground tracking-[0.06em]">
                    {band.index}
                  </span>
                  <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-foreground/85">
                    {band.title}
                  </span>
                  {overridesByBand[band.index] > 0 && (
                    <span className="font-mono tabular-nums text-[9px] px-1 py-0.5 rounded-sm bg-[var(--ds-overlay-warning-soft)] text-[color:var(--ds-accent-warning)] border border-[color:var(--ds-overlay-warning-ring)] leading-none">
                      {overridesByBand[band.index]}
                    </span>
                  )}
                  <span className="flex-1 h-px bg-border" />
                </header>
                {isBandMounted(band.index) ? (
                  band.fields.map((f, i) => (
                    <FieldRenderer
                      key={i}
                      field={f}
                      state={draft}
                      update={update}
                    />
                  ))
                ) : (
                  // Idle sweep hasn't reached this band yet — hold its
                  // approximate height so the scrollbar doesn't jump as
                  // bands fill in.
                  <div aria-hidden style={{ minHeight: 420 }} />
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
});
