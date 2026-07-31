import { lazy, Suspense, useState, type ComponentType } from 'react';
import { Tabs, TabsContent, TooltipProvider } from '@wellsfargo-starui/ui';
import { LabSidebarNav } from './components/LabSidebarNav';
import { ThemeToggle } from './components/ThemeToggle';
import { HomeTab } from './tabs/HomeTab';
import { LabDemoProvider } from './demo/LabDemoContext';
import { LabScenarioRail } from './demo/LabScenarioRail';

const OverviewTab = lazy(() => import('./tabs/OverviewTab').then((m) => ({ default: m.OverviewTab })));
const FormattingTab = lazy(() => import('./tabs/FormattingTab').then((m) => ({ default: m.FormattingTab })));
const RenderersTab = lazy(() => import('./tabs/RenderersTab').then((m) => ({ default: m.RenderersTab })));
const FormatterToolbarTab = lazy(() => import('./tabs/FormatterToolbarTab').then((m) => ({ default: m.FormatterToolbarTab })));
const ColumnGroupsTab = lazy(() => import('./tabs/ColumnGroupsTab').then((m) => ({ default: m.ColumnGroupsTab })));
const CalculatedColumnsTab = lazy(() => import('./tabs/CalculatedColumnsTab').then((m) => ({ default: m.CalculatedColumnsTab })));
const ConditionalStylingTab = lazy(() => import('./tabs/ConditionalStylingTab').then((m) => ({ default: m.ConditionalStylingTab })));
const QuickFiltersTab = lazy(() => import('./tabs/QuickFiltersTab').then((m) => ({ default: m.QuickFiltersTab })));
const LiveUpdatesTab = lazy(() => import('./tabs/LiveUpdatesTab').then((m) => ({ default: m.LiveUpdatesTab })));
const AlertsTab = lazy(() => import('./tabs/AlertsTab').then((m) => ({ default: m.AlertsTab })));
const EditingTab = lazy(() => import('./tabs/EditingTab').then((m) => ({ default: m.EditingTab })));
const BulkUpdateTab = lazy(() => import('./tabs/BulkUpdateTab').then((m) => ({ default: m.BulkUpdateTab })));
const PlusMinusTab = lazy(() => import('./tabs/PlusMinusTab').then((m) => ({ default: m.PlusMinusTab })));
const ShortcutsTab = lazy(() => import('./tabs/ShortcutsTab').then((m) => ({ default: m.ShortcutsTab })));
const ProfilesTab = lazy(() => import('./tabs/ProfilesTab').then((m) => ({ default: m.ProfilesTab })));
const VisualExcelTab = lazy(() => import('./tabs/VisualExcelTab').then((m) => ({ default: m.VisualExcelTab })));

interface TabEntry {
  id: string;
  label: string;
  hint: string;
  Component: ComponentType;
}

// Order is per-tab; the sidebar groups them via LAB_CATEGORIES. `home` is
// rendered specially (needs navigation), so it is not in this list.
const TABS: TabEntry[] = [
  { id: 'overview', label: 'Overview', hint: 'Full feature kitchen-sink', Component: OverviewTab },
  { id: 'formatting', label: 'Formatting', hint: 'Value formatters & types', Component: FormattingTab },
  { id: 'visual-excel', label: 'Visual Excel', hint: 'WYSIWYG styled .xlsx export', Component: VisualExcelTab },
  { id: 'renderers', label: 'Cell Renderers', hint: 'Visual cell components', Component: RenderersTab },
  { id: 'toolbar', label: 'Formatter Toolbar', hint: 'Live cell-style toolbar', Component: FormatterToolbarTab },
  { id: 'groups', label: 'Column Groups', hint: 'Nested header groups', Component: ColumnGroupsTab },
  { id: 'calc', label: 'Calculated', hint: 'Derived virtual columns', Component: CalculatedColumnsTab },
  { id: 'conditional', label: 'Conditional Style', hint: 'Expression-driven styling', Component: ConditionalStylingTab },
  { id: 'filters', label: 'Quick Filters', hint: 'Saved filter pill buttons', Component: QuickFiltersTab },
  { id: 'live', label: 'Live Updates', hint: 'High-frequency stream', Component: LiveUpdatesTab },
  { id: 'alerts', label: 'Alerts', hint: 'Triggers, toasts, bell + OpenFin', Component: AlertsTab },
  { id: 'editing', label: 'Editing', hint: 'Full editing family demo', Component: EditingTab },
  { id: 'bulk-update', label: 'Bulk Update', hint: 'Replace selection with one value', Component: BulkUpdateTab },
  { id: 'plus-minus', label: 'Plus / Minus', hint: 'Keyboard nudge rules', Component: PlusMinusTab },
  { id: 'shortcuts', label: 'Shortcuts', hint: 'Letter-key arithmetic', Component: ShortcutsTab },
  { id: 'profiles', label: 'Profiles', hint: 'Pre-baked configurations', Component: ProfilesTab },
];

// Sidebar items include Home (synthetic) plus every real tab.
const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  ...TABS.map(({ id, label }) => ({ id, label })),
];

const HINT_BY_ID: Record<string, string> = {
  home: 'Start here — what MarketsGrid is',
  ...Object.fromEntries(TABS.map((t) => [t.id, t.hint])),
};

function TabFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
      Loading tab…
    </div>
  );
}

export function App() {
  const [active, setActive] = useState<string>('home');
  const [query, setQuery] = useState('');

  return (
    <LabDemoProvider>
      <TooltipProvider delayDuration={250}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
          <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-text-primary)]" aria-hidden />
              <h1 className="text-[15px] font-semibold tracking-tight">MarketsGrid Feature Lab</h1>
              <span className="ml-2 text-[12px] font-normal text-[color:var(--ds-text-secondary)]">
                · {HINT_BY_ID[active] ?? ''}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <LabSidebarNav
              items={NAV_ITEMS}
              activeId={active}
              onSelect={setActive}
              query={query}
              onQueryChange={setQuery}
            />

            <Tabs
              value={active}
              onValueChange={setActive}
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
              <TabsContent
                value="home"
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0 data-[state=inactive]:hidden"
              >
                {active === 'home' ? <HomeTab items={NAV_ITEMS} onNavigate={setActive} /> : null}
              </TabsContent>

              {TABS.map((t) => (
                <TabsContent
                  key={t.id}
                  value={t.id}
                  className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
                >
                  {active === t.id ? (
                    <Suspense fallback={<TabFallback />}>
                      <t.Component />
                    </Suspense>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>

            <LabScenarioRail activeTab={active} />
          </div>
        </div>
      </TooltipProvider>
    </LabDemoProvider>
  );
}
