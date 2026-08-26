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

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { AiAssistantPanel } from '../aiAssistant/AiAssistantPanel';
import { useOpenFinThemeSync } from '../useOpenFinThemeSync';

function AiAssistant() {
  // `?grid=…&scope=locked` is set by `openAssistantPopout` when the wand button
  // on a blotter's toolbar opens this window — same URL-param contract the
  // provider editor uses.
  const [params] = useSearchParams();
  const scopedGridId = params.get('grid') ?? undefined;
  const scopedInstanceId = params.get('instance') ?? undefined;
  const scopedGridName = params.get('name') ?? undefined;
  const locked = params.get('scope') === 'locked' && Boolean(scopedGridId || scopedInstanceId);
  // Reported by the panel once the instance id resolves to a registry entry.
  const [scope, setScope] = useState<{ gridId: string; displayName?: string } | null>(null);

  // This route mounts outside StarGridApp/OpenFinRuntime — sync the dock theme
  // toggle directly so the panel flips with the rest of the platform.
  useOpenFinThemeSync();

  useEffect(() => {
    const prev = document.title;
    const label = scope?.displayName ?? scope?.gridId ?? scopedGridName;
    document.title = label ? `AI Assistant · ${label}` : 'AI Assistant · Markets UI';
    return () => { document.title = prev; };
  }, [scope, scopedGridName]);

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
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/60 flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="flex items-baseline gap-2 text-[11px] tracking-wide text-muted-foreground">
          {locked && scope && (
            <span
              className="font-mono text-[10px] text-foreground/70"
              title={`Scoped to ${scope.displayName ?? scope.gridId}${scopedInstanceId ? ` · window ${scopedInstanceId}` : ''}`}
            >
              {scope.gridId}
            </span>
          )}
          <span className="font-medium">AI Assistant</span>
        </span>
      </header>
      <div className="flex-1 min-h-0">
        <AiAssistantPanel
          scopedGridId={scopedGridId}
          scopedInstanceId={scopedInstanceId}
          scopedGridName={scopedGridName}
          locked={locked}
          onScopeResolved={setScope}
        />
      </div>
    </div>
  );
}

export default AiAssistant;
