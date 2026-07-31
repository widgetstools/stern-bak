import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  DockManagerCore,
  type DockManagerCoreHandle,
  type WidgetProps,
} from '@widgetstools/react-dock-manager';
import {
  type DockManagerState,
  type SerializedDockLayout,
  deserialize,
  slateDark,
  vsCodeLight,
} from '@widgetstools/dock-manager-core';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@wellsfargo-starui/ui';
import { Sun, Moon, CircleHelp } from 'lucide-react';
import { Brand } from './components/Brand';
import { HelpSheet } from './components/HelpSheet';
import { StatsProvider } from './state/StatsContext';
import { useMockConfig } from './state/MockConfigContext';
import { ProviderConfigPanel } from './panels/ProviderConfigPanel';
import { DirectGridPanel } from './panels/DirectGridPanel';
import { DataServicesGridPanel } from './panels/DataServicesGridPanel';
import { StatsPanel } from './panels/StatsPanel';

const WIDGETS: Record<string, React.ComponentType<WidgetProps>> = {
  providerConfig:   () => <ProviderConfigPanel />,
  directGrid:       () => <DirectGridPanel />,
  dataServicesGrid: () => <DataServicesGridPanel />,
  stats:            () => <StatsPanel />,
};

const SERIALIZED_LAYOUT: SerializedDockLayout = {
  version: 1,
  layout: {
    type: 'split',
    id: 'root',
    direction: 'vertical',
    sizes: [82, 18],
    children: [
      {
        type: 'split',
        id: 'top',
        direction: 'horizontal',
        sizes: [28, 72],
        children: [
          { type: 'tabgroup', id: 'tg-config', panels: ['providerConfig'], activePanel: 'providerConfig' },
          {
            type: 'tabgroup',
            id: 'tg-grids',
            panels: ['directGrid', 'dataServicesGrid'],
            activePanel: 'directGrid',
          },
        ],
      },
      { type: 'tabgroup', id: 'tg-stats', panels: ['stats'], activePanel: 'stats' },
    ],
  },
  panels: {
    providerConfig:   { id: 'providerConfig',   title: 'Provider Config',          widgetType: 'providerConfig',   closable: false },
    directGrid:       { id: 'directGrid',       title: 'Direct · startMock()',     widgetType: 'directGrid',       closable: false },
    dataServicesGrid: { id: 'dataServicesGrid', title: 'via DataServicesProvider', widgetType: 'dataServicesGrid', closable: false },
    stats:            { id: 'stats',            title: 'Live stats',               widgetType: 'stats',            closable: false },
  },
  placements: {
    providerConfig:   { type: 'docked', groupId: 'tg-config' },
    directGrid:       { type: 'docked', groupId: 'tg-grids' },
    dataServicesGrid: { type: 'docked', groupId: 'tg-grids' },
    stats:            { type: 'docked', groupId: 'tg-stats' },
  },
  activePaneId: 'directGrid',
  nextZIndex: 100,
};

const INITIAL_LAYOUT: DockManagerState = deserialize(SERIALIZED_LAYOUT).state;

export function App() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';
  const [helpOpen, setHelpOpen] = useState(false);
  const dockRef = useRef<DockManagerCoreHandle | null>(null);
  const { setDataType } = useMockConfig();

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ theme: next });
    setThemeState(next);
  }, [isDark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === '/') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (k === '.') {
        e.preventDefault();
        handleToggleTheme();
      } else if (k === '1') {
        e.preventDefault();
        setDataType('positions');
      } else if (k === '2') {
        e.preventDefault();
        setDataType('trades');
      } else if (k === '3') {
        e.preventDefault();
        setDataType('orders');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleToggleTheme, setDataType]);

  const dockTheme = useMemo(() => (isDark ? slateDark : vsCodeLight), [isDark]);
  const tooltipLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <StatsProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
        <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
          <Brand />
          <div className="ml-auto flex items-center gap-2">
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setHelpOpen(true)}
                    aria-label="Open help"
                    className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                    data-testid="help-toggle"
                  >
                    <CircleHelp size={13} strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Help (Ctrl + /)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleToggleTheme}
                    aria-label={tooltipLabel}
                    className="h-7 w-7 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                    data-testid="theme-toggle"
                  >
                    {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
            <DockManagerCore
              ref={dockRef}
              initialState={INITIAL_LAYOUT}
              widgets={WIDGETS}
              theme={dockTheme}
              className="h-full w-full"
            />
          </div>
        </main>
      </div>
    </StatsProvider>
  );
}
