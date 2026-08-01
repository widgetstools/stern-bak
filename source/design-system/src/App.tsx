import { useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, TooltipProvider, Toaster, toast } from '@wellsfargo-starui/react';
import { DockManagerCore } from '@widgetstools/react-dock-manager';
import type { DockManagerState } from '@widgetstools/dock-manager-core';
import { TopBar } from './components/TopBar';
import { FloatingWindow } from './components/FloatingWindow';
import { TradeTicket } from './panels/TradeTicket';
import { RfqWorkbench } from './panels/RfqWorkbench';
import { DemoStateProvider, useDemoState } from './state/DemoStateProvider';
import { ResearchProvider } from './state/ResearchProvider';
import { ThemeModeProvider, useThemeMode } from './lib/useThemeMode';
import { WIDGETS } from './lib/dock/registry';
import { TAB_LAYOUTS } from './lib/dock/layouts';
import { loadLayout, saveLayout, resetLayout } from './lib/dock/persistence';

interface TabDef {
  id: string;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'market', label: 'Market' },
  { id: 'orders', label: 'Orders' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'risk', label: 'Risk' },
  { id: 'research', label: 'Research' },
  { id: 'design-system', label: 'Design System' },
];

// ─── AppContent — reads DemoState, renders dock + overlays ────────────────────

function AppContent() {
  const { store, selectedId } = useDemoState();
  const { mode } = useThemeMode();

  const [active, setActive] = useState('market');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const layoutRef = useRef<Record<string, DockManagerState>>({});

  const instrument = store.state.instruments.find((i) => i.id === selectedId)
    ?? store.state.instruments[0];
  const quote = instrument ? store.state.quotes[instrument.id] : undefined;

  const handleSave = () => {
    const layout = layoutRef.current[active] ?? loadLayout(active) ?? TAB_LAYOUTS[active]();
    saveLayout(active, layout);
    toast({ title: 'Layout saved', description: `"${active}" tab layout saved.` });
  };

  const handleReset = () => {
    resetLayout(active);
    setResetKey((k) => k + 1);
    toast({ title: 'Layout reset', description: `"${active}" tab reset to default.` });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <TopBar
        state={store.state}
        onNewOrder={() => setTicketOpen((o) => !o)}
        onRfq={() => setRfqOpen((o) => !o)}
        onSave={handleSave}
        onReset={handleReset}
      />

      <Tabs
        value={active}
        onValueChange={setActive}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="h-10 shrink-0 justify-start gap-1 rounded-none border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              data-testid={`ds-tab-${t.id}`}
              className="h-7 px-3 text-[12px] data-[state=active]:bg-[color:var(--ds-surface-secondary)] data-[state=active]:text-[color:var(--ds-text-primary)]"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent
            key={t.id}
            value={t.id}
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <DockManagerCore
              // Remount on theme toggle: the dock applies its light/dark root
              // class only at construction (updateOptions doesn't re-theme), so
              // a fresh mount is what re-themes the panel chrome. `mode` in the
              // key forces that; reading the live in-memory layout as
              // initialState preserves the current arrangement across remount.
              key={`${t.id}-${resetKey}-${mode}`}
              initialState={layoutRef.current[t.id] ?? loadLayout(t.id) ?? TAB_LAYOUTS[t.id]()}
              widgets={WIDGETS}
              theme={mode}
              onStateChange={(s) => { layoutRef.current[t.id] = s; }}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Floating Trade Ticket */}
      {ticketOpen && instrument && quote && (
        <FloatingWindow
          title="Trade Ticket"
          onClose={() => setTicketOpen(false)}
          initial={{ x: 120, y: 80, width: 380, height: 560 }}
          testid="float-ticket"
        >
          <TradeTicket
            instrument={instrument}
            quote={quote}
            onClose={() => setTicketOpen(false)}
          />
        </FloatingWindow>
      )}

      {/* Floating RFQ Workbench */}
      {rfqOpen && (
        <FloatingWindow
          title="RFQ Workbench"
          onClose={() => setRfqOpen(false)}
          initial={{ x: 90, y: 56, width: 1060, height: 590 }}
          testid="float-rfq"
        >
          <RfqWorkbench />
        </FloatingWindow>
      )}
    </div>
  );
}

// ─── App — provides DemoState + Toaster ───────────────────────────────────────

export function App() {
  return (
    <TooltipProvider delayDuration={250}>
      <ThemeModeProvider>
        <DemoStateProvider>
          <ResearchProvider>
            <AppContent />
            <Toaster />
          </ResearchProvider>
        </DemoStateProvider>
      </ThemeModeProvider>
    </TooltipProvider>
  );
}
