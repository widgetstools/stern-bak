import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
  type MarketsGridHandle,
} from '@wellsfargo-starui/grid';
import { activeProfileKey } from '@wellsfargo-starui/core';
import { GRID_ID, STORAGE_KEY } from './gridId';
import {
  applyTheme,
  getTheme,
} from '@wellsfargo-starui/design-system';
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@wellsfargo-starui/react';
import { Sun, Moon, CircleHelp } from 'lucide-react';
import { buildBondInventory } from './mockBonds';
import { bondColumnDefs, bondDefaultColDef } from './bondColumns';
import { Brand } from './components/Brand';
import { AppMenubar } from './components/AppMenubar';
import { StatusStrip } from './components/StatusStrip';
import { ConfigInspector } from './components/ConfigInspector';
import { HelpSheet } from './components/HelpSheet';

const storage = createMarketsGridLocalStorageStorage();

interface ProfilePulse {
  activeName: string | null;
  count: number;
}

function readProfilePulse(): ProfilePulse {
  if (typeof localStorage === 'undefined') return { activeName: null, count: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeName: null, count: 0 };
    const parsed = JSON.parse(raw) as {
      profiles?: Array<{ id: string; name: string }>;
      activeProfileId?: string;
    };
    const profiles = parsed.profiles ?? [];
    const activeId =
      localStorage.getItem(activeProfileKey(GRID_ID)) ?? parsed.activeProfileId;
    const active = profiles.find((p) => p.id === activeId) ?? null;
    return { activeName: active?.name ?? null, count: profiles.length };
  } catch {
    return { activeName: null, count: 0 };
  }
}

export function App() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';

  const [rows] = useState(() => buildBondInventory(180));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pulse, setPulse] = useState<ProfilePulse>(() => readProfilePulse());
  const handleRef = useRef<MarketsGridHandle | null>(null);
  const eventOffsRef = useRef<Array<() => void>>([]);

  // Pulse refreshes via grid events (subscribed in onReady) rather than
  // polling — the App tree was re-rendering every 800ms regardless, which
  // bloated React's commit cost during profile switches.

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ ...getTheme(), theme: next }); // spread keeps cvd/variant
    setThemeState(next);
  }, [isDark]);

  const handleOpenInspector = useCallback(() => setInspectorOpen(true), []);

  const handleReset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(activeProfileKey(GRID_ID));
    } catch {
      /* */
    }
    window.location.reload();
  }, []);

  const handleExport = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${GRID_ID}-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        JSON.parse(text);
        localStorage.setItem(STORAGE_KEY, text);
        window.location.reload();
      } catch {
        // Silent — production would surface a toast. Demo keeps deps small.
      }
    };
    input.click();
  }, []);

  // Keyboard shortcuts: Ctrl+E export, Ctrl+I import, Ctrl+J inspector,
  // Ctrl+. theme, Ctrl+Shift+R reset, Ctrl+/ help. Mirrors menubar labels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        e.preventDefault();
        handleExport();
      } else if (k === 'i') {
        e.preventDefault();
        handleImport();
      } else if (k === 'j') {
        e.preventDefault();
        setInspectorOpen((o) => !o);
      } else if (k === '/') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (k === '.') {
        e.preventDefault();
        handleToggleTheme();
      } else if (e.shiftKey && k === 'r') {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleExport, handleImport, handleReset, handleToggleTheme]);

  const onReady = useCallback((handle: MarketsGridHandle) => {
    handleRef.current = handle;
    setPulse(readProfilePulse());
    // Refresh the status-strip pulse only on real profile events instead of
    // polling. Covers switch (`profile:loaded`) and explicit save
    // (`profile:saved`) — the two events users actually care about seeing
    // reflected. Create / delete / rename are reached via the inspector
    // sheet, which re-reads on open. Disposers are captured and released
    // on unmount — StrictMode double-mounts otherwise double-subscribe.
    eventOffsRef.current.push(
      handle.platform.events.on('profile:loaded', () => setPulse(readProfilePulse())),
      handle.platform.events.on('profile:saved', () => setPulse(readProfilePulse())),
    );
  }, []);

  useEffect(() => {
    return () => {
      for (const off of eventOffsRef.current) off();
      eventOffsRef.current = [];
    };
  }, []);

  const tooltipLabel = useMemo(
    () => (isDark ? 'Switch to light mode' : 'Switch to dark mode'),
    [isDark],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <header className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-4 pr-3">
        <Brand />
        <div className="ml-2 h-6 w-px bg-[color:var(--ds-border-primary)]" />
        <AppMenubar
          onReset={handleReset}
          onExport={handleExport}
          onImport={handleImport}
          onOpenInspector={handleOpenInspector}
          onToggleTheme={handleToggleTheme}
          isDark={isDark}
        />
        <div className="ml-auto flex items-center gap-2">
          <ConfigInspector
            gridId={GRID_ID}
            open={inspectorOpen}
            onOpenChange={setInspectorOpen}
            onClearAll={handleReset}
          />
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
                  {isDark ? (
                    <Sun size={13} strokeWidth={1.75} />
                  ) : (
                    <Moon size={13} strokeWidth={1.75} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
        </div>
      </header>

      <StatusStrip
        rows={rows}
        activeProfileName={pulse.activeName}
        profileCount={pulse.count}
        storageKey={STORAGE_KEY}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]">
            <MarketsGrid
              gridId={GRID_ID}
              rowData={rows}
              columnDefs={bondColumnDefs}
              defaultColDef={bondDefaultColDef}
              rowIdField="id"
              storage={storage}
              showFiltersToolbar
              showFormattingToolbar
              showEditingToolbar
              showProfileSelector
              showSaveButton
              showSettingsButton
              componentName="Bond Blotter"
              onReady={onReady}
              sideBar={{ toolPanels: ['columns', 'filters'] }}
              statusBar={{
                statusPanels: [
                  { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                  { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
                  { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
                  { statusPanel: 'agAggregationComponent', align: 'right' },
                ],
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
