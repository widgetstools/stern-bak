/**
 * NlpAssistant — standalone page for the LLM-free assistant. Same shell and
 * URL-param contract as `AiAssistant.tsx` (`?grid=&instance=&name=&scope=locked`)
 * so the wand button can open either one.
 */
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { NlpAssistantPanel } from '../nlpAssistant/NlpAssistantPanel';
import { useOpenFinThemeSync } from '../useOpenFinThemeSync';

function NlpAssistant() {
  const [params] = useSearchParams();
  const scopedGridId = params.get('grid') ?? undefined;
  const scopedGridName = params.get('name') ?? undefined;
  const locked = params.get('scope') === 'locked' && Boolean(scopedGridId);

  useOpenFinThemeSync();

  useEffect(() => {
    const prev = document.title;
    document.title = scopedGridName ? `NLP Assistant · ${scopedGridName}` : 'NLP Assistant · Markets UI';
    return () => {
      document.title = prev;
    };
  }, [scopedGridName]);

  useEffect(() => {
    const bodyStyle = document.body.style;
    const prev = { padding: bodyStyle.padding, margin: bodyStyle.margin, overflow: bodyStyle.overflow };
    bodyStyle.padding = '0';
    bodyStyle.margin = '0';
    bodyStyle.overflow = 'hidden';
    return () => {
      bodyStyle.padding = prev.padding;
      bodyStyle.margin = prev.margin;
      bodyStyle.overflow = prev.overflow;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border/60 px-4 py-2">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="flex items-baseline gap-2 text-[11px] tracking-wide text-muted-foreground">
          {locked && scopedGridId && <span className="font-mono text-[10px] text-foreground/70">{scopedGridId}</span>}
          <span className="font-medium">NLP Assistant</span>
          <span className="rounded border border-border/60 px-1 py-px font-mono text-[9px]">no LLM</span>
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <NlpAssistantPanel scopedGridId={scopedGridId} scopedGridName={scopedGridName} locked={locked} />
      </div>
    </div>
  );
}

export default NlpAssistant;
