import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  IconInput,
  ObjectTitleRow,
  SettingsRow as Row,
  SharpBtn,
} from '../../ui/SettingsPanel';
import { Select } from '../../ui/NativeOptionsSelect';
import { cn } from '@wellsfargo-starui/react';
import { ExpressionEngine } from '@wellsfargo-starui/core';
import { ChromeButton } from '../../ui/ChromeButton';
import { ExpressionEditor } from '../../ui/ExpressionEditor';
import { useGridColumns } from '../../hooks/useGridColumns';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useCapabilityGate } from '../../hooks/useCapability';
import {
  useAppDataKeys,
  useAppDataLookup,
  useAppDataProviders,
} from '../column-customization/editors/CellEditorEditor';
import { BoolControl } from '../general-settings/fieldSchema';
import {
  ProviderGridHostSection,
  type ProviderSelectionDraft,
} from './ProviderGridHostSection';
import { GridEventBindingsSection } from './GridEventBindingsSection';
import { useProviderGridHost } from '../../providerGridHost/ProviderGridHostContext';
import {
  useGridEventBindingsHost,
  type GridEventBindingsMap,
} from '../../gridEventBindingsHost/GridEventBindingsHostContext';
import {
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

/** Structural equality good enough for the POJO staging values here. */
function jsonEqual<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

interface Staged<T> {
  value: T;
  set: (patch: Partial<T> | ((prev: T) => T)) => void;
  dirty: boolean;
  reset: () => void;
}

/**
 * Stage edits locally and apply them elsewhere (a grid-level host) only on
 * an explicit Save. Mirrors `useModuleDraft`'s clean/dirty re-seed: while
 * clean, the staged value tracks the committed (host) value; once the user
 * edits, their draft is preserved until Save (apply) or Reset (revert).
 */
function useStaged<T>(committed: T): Staged<T> {
  const committedKey = useMemo(() => {
    try { return JSON.stringify(committed); } catch { return String(committed); }
  }, [committed]);

  const [staged, setStaged] = useState<T>(committed);
  const committedRef = useRef<T>(committed);

  // Memoize the dirty check — `jsonEqual` serializes BOTH operands, so an
  // unmemoized compute ran two full `JSON.stringify` of the (potentially large)
  // provider config on EVERY render of this panel. Recompute only when the
  // staged draft or the committed host value actually changes reference.
  const dirty = useMemo(() => !jsonEqual(staged, committed), [staged, committed]);

  // Re-seed only when the host value changes AND we're clean — never clobber
  // a mid-edit draft. Keyed on the serialized committed value so a new object
  // reference with identical content doesn't churn.
  useEffect(() => {
    const prev = committedRef.current;
    committedRef.current = committed;
    const wasClean = jsonEqual(prev, staged);
    if (wasClean && !jsonEqual(prev, committed)) setStaged(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedKey]);

  const set = useCallback<Staged<T>['set']>((patch) => {
    setStaged((prev) =>
      typeof patch === 'function'
        ? (patch as (p: T) => T)(prev)
        : { ...prev, ...patch },
    );
  }, []);

  const reset = useCallback(() => setStaged(committedRef.current), []);

  return { value: staged, set, dirty, reset };
}

const SECTIONS = [
  {
    index: '01',
    id: 'toolbar-date',
    title: 'Toolbar Date',
    headerTitle: 'TOOLBAR DATE PICKER',
  },
  {
    index: '02',
    id: 'data-provider',
    title: 'Data Provider',
    headerTitle: 'DATA PROVIDER',
  },
  {
    index: '03',
    id: 'event-callbacks',
    title: 'Event Callbacks',
    headerTitle: 'EVENT CALLBACKS',
  },
  {
    index: '04',
    id: 'row-filter',
    title: 'Row Filter',
    headerTitle: 'ROW EXCLUSION',
  },
] as const;

/** One-click starting points for the row-exclusion expression. */
const ROW_FILTER_EXAMPLES: ReadonlyArray<{ label: string; expr: string }> = [
  { label: 'active is false', expr: '[active] == false' },
  { label: 'one currency', expr: '[ccy] == "INR"' },
  { label: 'negative amount', expr: '[notional] < 0' },
  { label: 'in a list', expr: '[ccy] IN ["INR", "XXX"]' },
];

type SectionIndex = (typeof SECTIONS)[number]['index'];

interface SectionNavItemProps {
  index: SectionIndex;
  title: string;
  active: boolean;
  onClick: () => void;
}

function SectionNavItem({ index, title, active, onClick }: SectionNavItemProps) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      data-testid={`tds-nav-${index}`}
      className={cn(
        'group flex h-control-sm w-full items-center gap-2 rounded-sm border-l-2 pl-2.5 pr-2 text-left transition-colors',
        active
          ? 'border-l-[color:var(--ds-primary)] bg-[var(--ds-primary-soft)] text-foreground'
          : 'border-l-transparent text-foreground/90 hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'w-5 shrink-0 font-mono text-[10px] tabular-nums leading-none',
          active ? 'text-[color:var(--ds-primary)]' : 'opacity-70',
        )}
      >
        {index}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.1em]">
        {title}
      </span>
    </ChromeButton>
  );
}

function SectionAnchor({
  index,
  title,
}: {
  index: SectionIndex;
  title: string;
}) {
  return (
    <header className="mb-2 flex select-none items-center gap-2.5">
      <span className="font-mono text-[10px] tabular-nums tracking-[0.06em] text-muted-foreground">
        {index}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/85">
        {title}
      </span>
      <span className="h-px flex-1 bg-border" />
    </header>
  );
}

export function ToolbarDateSettingsPanel(): ReactElement {
  const {
    draft,
    setDraft,
    dirty: dateDirty,
    save: saveDate,
    discard: discardDate,
  } = useModuleDraft<ToolbarDateSettingsState, ToolbarDateSettingsState>({
    moduleId: TOOLBAR_DATE_SETTINGS_MODULE_ID,
    itemId: 'settings',
    selectItem: (state) => state,
    commitItem: (next) => () => next,
  });

  // ─── Section 02/03 staging — apply on Save, not on change ───────────
  const providerHost = useProviderGridHost();
  const bindingsHost = useGridEventBindingsHost();

  const committedProvider = useMemo<ProviderSelectionDraft>(
    () => ({
      liveProviderId: providerHost?.liveProviderId ?? null,
      historicalProviderId: providerHost?.historicalProviderId ?? null,
      mode: providerHost?.mode ?? 'live',
      asOfDate: providerHost?.asOfDate ?? null,
    }),
    [
      providerHost?.liveProviderId,
      providerHost?.historicalProviderId,
      providerHost?.mode,
      providerHost?.asOfDate,
    ],
  );
  const providerStaged = useStaged<ProviderSelectionDraft>(committedProvider);

  const committedBindings = useMemo<GridEventBindingsMap>(
    () => bindingsHost?.bindings ?? {},
    [bindingsHost?.bindings],
  );
  const bindingsStaged = useStaged<GridEventBindingsMap>(committedBindings);

  const providerDirty = Boolean(providerHost?.available) && providerStaged.dirty;
  const bindingsDirty = Boolean(bindingsHost?.available) && bindingsStaged.dirty;
  const dirty = dateDirty || providerDirty || bindingsDirty;

  const handleBindingChange = useCallback(
    (eventId: string, handlerId: string | null) => {
      bindingsStaged.set((prev) => {
        const next = { ...prev };
        if (handlerId == null) delete next[eventId];
        else next[eventId] = [handlerId];
        return next;
      });
    },
    [bindingsStaged],
  );

  const save = useCallback(() => {
    saveDate();
    if (providerHost?.available) {
      const s = providerStaged.value;
      if (s.liveProviderId !== providerHost.liveProviderId) {
        providerHost.onLiveChange(s.liveProviderId);
      }
      if (s.historicalProviderId !== providerHost.historicalProviderId) {
        providerHost.onHistoricalChange(s.historicalProviderId);
      }
      if (s.mode !== providerHost.mode) providerHost.onModeChange(s.mode);
      if (s.asOfDate !== providerHost.asOfDate) {
        providerHost.onAsOfDateChange(s.asOfDate);
      }
    }
    if (bindingsHost?.available && bindingsStaged.dirty) {
      bindingsHost.setBindings(bindingsStaged.value);
    }
    // `saveDate` (useModuleDraft.save) emits `settings:save-requested`, which
    // flushes the active profile — so the toolbar-date + row-filter cards
    // persist alongside the gridLevelData-backed provider/bindings cards.
  }, [
    saveDate,
    providerHost,
    providerStaged.value,
    bindingsHost,
    bindingsStaged.value,
    bindingsStaged.dirty,
  ]);

  const discard = useCallback(() => {
    discardDate();
    providerStaged.reset();
    bindingsStaged.reset();
  }, [discardDate, providerStaged, bindingsStaged]);

  const appData = useAppDataLookup();
  const providers = useAppDataProviders(appData);
  const keys = useAppDataKeys(appData, draft.historicalDateAppDataProvider || undefined);

  // Live column list for the row-exclusion expression editor's autocomplete.
  // `useGridColumns` keeps a stable array reference while the column set is
  // unchanged, so the provider callback only re-subscribes on real changes.
  const columns = useGridColumns();
  const columnsProvider = useCallback(
    () =>
      columns.map((c) => ({
        colId: c.colId,
        headerName: c.headerName,
        dataType: c.cellDataType,
      })),
    [columns],
  );

  // Live validation for the row-exclusion expression. The engine is the same
  // CSP-safe one that compiles the filter at runtime, so "Valid" here means
  // the expression will actually parse when applied.
  const exprEngine = useMemo(() => new ExpressionEngine(), []);

  /**
   * Row exclusion installs AG-Grid's EXTERNAL FILTER
   * (`isExternalFilterPresent` / `doesExternalFilterPass`), and AG-Grid only
   * consults those from its client-side filtering stage — nothing on the
   * server-side path calls `doesRowPassFilter`. So the expression compiled,
   * validated, saved, and then hid nothing at all.
   *
   * Excluding rows properly here means the SOURCE excluding them, so counts
   * and paging agree; that needs the query plane to evaluate a per-session
   * predicate before it pages, which does not exist yet. Until then the
   * control says so rather than accepting an expression it will ignore.
   */
  const rowExclusionGate = useCapabilityGate('canAddressUnloadedRows', {
    reason:
      'Row exclusion hides rows in the grid, and this grid loads rows from the '
      + 'server as you scroll — so an expression here would leave the row '
      + 'counts and the rows themselves disagreeing. Use the column filters to '
      + 'narrow the view instead; those run at the server.',
  });
  const rowExpr = (draft.rowExclusionExpression ?? '').trim();
  const rowExprValidation = rowExpr
    ? exprEngine.validate(rowExpr)
    : { valid: true, errors: [] as Array<{ message: string }> };

  const [activeSection, setActiveSection] = useState<SectionIndex>('01');
  const sectionRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const update = <K extends keyof ToolbarDateSettingsState>(
    key: K,
    value: ToolbarDateSettingsState[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const scrollToSection = useCallback((index: SectionIndex) => {
    sectionRefs.current.get(index)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(index);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const idx = visible[0].target.getAttribute('data-section-index');
          if (idx && idx !== activeSectionRef.current) {
            setActiveSection(idx as SectionIndex);
          }
        }
      },
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const [, el] of sectionRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="toolbar-date-settings-panel">
      <div className="shrink-0 border-b border-border bg-background">
        <ObjectTitleRow
          title="Custom Settings"
          actions={(
            <>
              <SharpBtn variant="ghost" onClick={discard} disabled={!dirty} data-testid="tds-reset-btn">Reset</SharpBtn>
              <SharpBtn variant="action" onClick={save} disabled={!dirty} data-testid="tds-save-btn">Save</SharpBtn>
            </>
          )}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          data-testid="tds-section-nav"
          className="w-[176px] shrink-0 overflow-y-auto border-r border-border bg-[var(--ds-surface-ground)] py-1.5"
        >
          <nav className="flex flex-col gap-px px-1">
            {SECTIONS.map((section) => (
              <SectionNavItem
                key={section.index}
                index={section.index}
                title={section.title}
                active={activeSection === section.index}
                onClick={() => scrollToSection(section.index)}
              />
            ))}
          </nav>
        </aside>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto pb-6">
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('01', el);
              else sectionRefs.current.delete('01');
            }}
            data-section-index="01"
            data-testid="toolbar-date-appdata-section"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="01" title={SECTIONS[0].headerTitle} />
            <p className="mb-3 text-[11px] text-[color:var(--ds-text-secondary)]">
              When the user picks a toolbar date before today, write the ISO date
              (`YYYY-MM-DD`) to the selected AppData provider key. Historical
              providers can reference the key via
              {' '}
              <code className="font-mono text-[10px]">{`{{provider.key}}`}</code>
              .
            </p>

            <Row
              label="ENABLED"
              hint="Allow past dates in the toolbar picker and write them to AppData."
              data-testid="tds-enabled"
              control={(
                <BoolControl
                  checked={draft.historicalDateAppDataEnabled}
                  onChange={(checked) => update('historicalDateAppDataEnabled', checked)}
                  testId="tds-enabled-switch"
                />
              )}
            />

            {draft.historicalDateAppDataEnabled ? (
              <>
                <Row
                  label="PROVIDER"
                  hint="Named AppData provider instance"
                  data-testid="tds-provider"
                  control={
                    appData?.listProviders ? (
                      <Select
                        value={draft.historicalDateAppDataProvider}
                        onChange={(e) => {
                          update('historicalDateAppDataProvider', e.target.value);
                          update('historicalDateAppDataKey', '');
                        }}
                        data-testid="tds-provider-select"
                        className="max-w-[240px]"
                      >
                        <option value="">— pick a provider —</option>
                        {providers.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </Select>
                    ) : (
                      <IconInput
                        value={draft.historicalDateAppDataProvider}
                        onCommit={(value) => update('historicalDateAppDataProvider', value.trim())}
                        placeholder="positions"
                        data-testid="tds-provider-text"
                        className="max-w-[240px]"
                      />
                    )
                  }
                />

                <Row
                  label="KEY"
                  hint="Key on the provider (e.g. asOfDate)"
                  data-testid="tds-key"
                  control={
                    appData?.keysOf && draft.historicalDateAppDataProvider ? (
                      <Select
                        value={draft.historicalDateAppDataKey}
                        onChange={(e) => update('historicalDateAppDataKey', e.target.value)}
                        data-testid="tds-key-select"
                        className="max-w-[240px]"
                      >
                        <option value="">— pick a key —</option>
                        {keys.map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </Select>
                    ) : (
                      <IconInput
                        value={draft.historicalDateAppDataKey}
                        onCommit={(value) => update('historicalDateAppDataKey', value.trim())}
                        placeholder="asOfDate"
                        data-testid="tds-key-text"
                        className="max-w-[240px]"
                      />
                    )
                  }
                />
              </>
            ) : null}
          </section>

          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('02', el);
              else sectionRefs.current.delete('02');
            }}
            data-section-index="02"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="02" title={SECTIONS[1].headerTitle} />
            <ProviderGridHostSection
              hideSectionHeader
              draft={providerStaged.value}
              onDraftChange={providerStaged.set}
            />
          </section>

          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('03', el);
              else sectionRefs.current.delete('03');
            }}
            data-section-index="03"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="03" title={SECTIONS[2].headerTitle} />
            <GridEventBindingsSection
              hideSectionHeader
              draft={bindingsStaged.value}
              onBindingChange={handleBindingChange}
            />
          </section>

          <section
            ref={(el) => {
              if (el) sectionRefs.current.set('04', el);
              else sectionRefs.current.delete('04');
            }}
            data-section-index="04"
            data-testid="tds-row-filter-section"
            className="px-5 pb-4 pt-3"
          >
            <SectionAnchor index="04" title={SECTIONS[3].headerTitle} />
            <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
              Hide rows whose values match an expression. A row is excluded when
              the expression is <strong>true</strong> — reference columns with{' '}
              <code className="font-mono text-[10px]">[field]</code> (e.g.{' '}
              <code className="font-mono text-[10px]">{`[ccy] == "INR"`}</code> or{' '}
              <code className="font-mono text-[10px]">{`[active] == false`}</code>).
              Type freely; column names autocomplete as you go. The row stays in
              the data and reappears if the value changes. Leave empty to show
              all rows. Applied when you press <strong>Save</strong>.
            </p>

            {rowExclusionGate.disabled ? (
              <p
                data-testid="tds-row-filter-unavailable"
                className="mb-3 rounded border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]"
              >
                {rowExclusionGate.reason}
              </p>
            ) : null}

            <div data-testid="tds-row-filter" className="space-y-2">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/85">
                Exclude rows when
              </label>

              <ExpressionEditor
                readOnly={rowExclusionGate.disabled}
                value={draft.rowExclusionExpression}
                // Stage every keystroke into the draft so Save always has the
                // latest text (no commit-on-blur surprise); onCommit trims on
                // blur/Enter. Feeding the draft back as `value` is a no-op
                // while typing (the editor only resets when text truly differs).
                onChange={(expr) => update('rowExclusionExpression', expr)}
                onCommit={(expr) => update('rowExclusionExpression', expr.trim())}
                columnsProvider={columnsProvider}
                multiline
                lines={3}
                fontSize={12}
                placeholder={`[active] == false`}
                className="w-full max-w-[520px] rounded-sm border border-border"
                data-testid="tds-row-filter-editor"
              />

              {/* Live validity feedback — mirrors the runtime compile. */}
              {rowExpr ? (
                rowExprValidation.valid ? (
                  <p
                    data-testid="tds-row-filter-valid"
                    className="text-[11px] text-muted-foreground"
                  >
                    ✓ Valid — hides rows where this is true.
                  </p>
                ) : (
                  <p
                    data-testid="tds-row-filter-error"
                    className="text-[11px] text-destructive"
                  >
                    {rowExprValidation.errors[0]?.message ?? 'Invalid expression.'}
                  </p>
                )
              ) : null}

              {/* One-click examples — fill the editor, then tweak. */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Examples
                </span>
                {ROW_FILTER_EXAMPLES.map((ex) => (
                  <button
                    key={ex.expr}
                    type="button"
                    title={ex.label}
                    disabled={rowExclusionGate.disabled}
                    onClick={() => update('rowExclusionExpression', ex.expr)}
                    data-testid="tds-row-filter-example"
                    className="rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {ex.expr}
                  </button>
                ))}
                {draft.rowExclusionExpression ? (
                  <button
                    type="button"
                    onClick={() => update('rowExclusionExpression', '')}
                    data-testid="tds-row-filter-clear"
                    className="rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
