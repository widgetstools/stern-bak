/**
 * MarketsGrid SSRM Parity Lab — the lab's 17 tabs against the server-side
 * row model. Home is the parity matrix; every feature tab renders the lab's
 * own config through the SSRM shell with its verdict above the grid.
 */
import { useState } from 'react';
import { Tabs, TabsContent, TooltipProvider } from '@wellsfargo-starui/react';
import { LabSidebarNav } from '../../markets-grid-lab/src/components/LabSidebarNav';
import { ThemeToggle } from '../../markets-grid-lab/src/components/ThemeToggle';
import { SsrmDemoProvider } from './demo/SsrmDemoContext';
import { SsrmDemoRail } from './demo/SsrmDemoRail';
import { ParityMatrixTab } from './parity/ParityMatrixTab';
import { SsrmLabFeatureTab } from './SsrmLabFeatureTab';
import { SsrmProfilesTab } from './tabs/SsrmProfilesTab';
import { useSeedLabSsrmProvider } from './ssrm/labSsrmProvider';
import { SSRM_TABS } from './tabs/tabConfigs';

const NAV_ITEMS = [
  { id: 'home', label: 'Parity Matrix' },
  ...SSRM_TABS.map(({ id, label }) => ({ id, label })),
  { id: 'profiles', label: 'Profiles' },
];

const HINT_BY_ID: Record<string, string> = {
  home: 'Feature-by-feature SSRM verdicts',
  profiles: 'Pre-baked configurations',
  ...Object.fromEntries(SSRM_TABS.map((t) => [t.id, t.hint])),
};

function SeedingFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
      Seeding the mock-ssrm provider…
    </div>
  );
}

export function App() {
  const [active, setActive] = useState<string>('home');
  const [query, setQuery] = useState('');
  const providerId = useSeedLabSsrmProvider();

  return (
    <SsrmDemoProvider>
      <TooltipProvider delayDuration={250}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
          <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-accent-warning)]" aria-hidden />
              <h1 className="text-[15px] font-semibold tracking-tight">MarketsGrid SSRM Parity Lab</h1>
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
                {active === 'home' ? <ParityMatrixTab onNavigate={setActive} /> : null}
              </TabsContent>

              {SSRM_TABS.map((t) => (
                <TabsContent
                  key={t.id}
                  value={t.id}
                  className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
                >
                  {active === t.id
                    ? (providerId
                      ? <SsrmLabFeatureTab config={t.config} providerId={providerId} />
                      : <SeedingFallback />)
                    : null}
                </TabsContent>
              ))}

              <TabsContent
                value="profiles"
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-3 data-[state=inactive]:hidden"
              >
                {active === 'profiles'
                  ? (providerId ? <SsrmProfilesTab providerId={providerId} /> : <SeedingFallback />)
                  : null}
              </TabsContent>
            </Tabs>

            <SsrmDemoRail activeTab={active} />
          </div>
        </div>
      </TooltipProvider>
    </SsrmDemoProvider>
  );
}
