/**
 * AiAssistant — standalone page hosting the `<AiAssistantPanel>` chat UI.
 *
 * This is the popout target the dock's "AI Assistant" button opens as its
 * own OpenFin platform window (see `../aiAssistant/ensureDockButton.ts`),
 * mirroring how `DataProviders.tsx` is the popout target for
 * `openProviderEditorPopout()`. There is no live MarketsGrid in this
 * window — grid customization tools operate on a target grid's
 * *persisted* profile (see `../aiAssistant/useToolExecutor.ts`).
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AiAssistantPanel } from '../aiAssistant/AiAssistantPanel';
import { useOpenFinThemeSync } from '../useOpenFinThemeSync';

function AiAssistant() {
  // This route mounts outside StarGridApp/OpenFinRuntime — sync the dock theme
  // toggle directly so the panel flips with the rest of the platform.
  useOpenFinThemeSync();

  useEffect(() => {
    const prev = document.title;
    document.title = 'AI Assistant · Markets UI';
    return () => { document.title = prev; };
  }, []);

  // Same flush-viewport treatment as DataProviders.tsx — the shell's
  // `body { padding: 10px }` leaks into popouts otherwise.
  useEffect(() => {
    const bodyStyle = document.body.style;
    const prevPadding = bodyStyle.padding;
    const prevMargin = bodyStyle.margin;
    const prevOverflow = bodyStyle.overflow;
    bodyStyle.padding = '0';
    bodyStyle.margin = '0';
    bodyStyle.overflow = 'hidden';
    return () => {
      bodyStyle.padding = prevPadding;
      bodyStyle.margin = prevMargin;
      bodyStyle.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="text-[11px] text-muted-foreground">AI Assistant</span>
      </header>
      <div className="flex-1 min-h-0">
        <AiAssistantPanel />
      </div>
    </div>
  );
}

export default AiAssistant;
