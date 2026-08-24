/**
 * The scrolling conversation view: user bubbles, markdown assistant
 * replies, and inline tool-activity cards. Auto-scrolls to the bottom as
 * content streams in, unless the user has scrolled up to read history.
 */
import { useEffect, useRef } from 'react';
import { FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { ScrollArea } from '@wellsfargo-starui/react';
import { MarkdownMessage } from './MarkdownMessage';
import { ToolCallCard } from './ToolCallCard';
import type { TranscriptItem } from './useChatSession';

export interface ChatTranscriptProps {
  items: TranscriptItem[];
  isBusy: boolean;
  error: string | null;
}

export function ChatTranscript({ items, isBusy, error }: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Only auto-scroll while the user is at (or near) the bottom, so scrolling
  // up to read earlier output isn't yanked away by streaming text.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const onScroll = () => {
      pinnedRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 60;
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (pinnedRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [items, isBusy]);

  const lastIsAssistant = items.at(-1)?.kind === 'assistant';

  // Radix gives the viewport's content wrapper an inline `display: table` so
  // wide content can scroll horizontally — but this ScrollArea renders no
  // horizontal scrollbar, and a table sizes to its content. One wide child (a
  // long tool summary, a code block) therefore widens the whole column, and
  // every `self-end` user bubble gets aligned to the right edge of that
  // overflow, i.e. off-screen. Forcing `block` keeps the wrapper at the
  // viewport width so children stay bounded and truncate / overflow-x-auto do
  // their job. The `!` is required: it overrides Radix's inline style.
  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1 min-h-0 border border-border rounded-md bg-card [&_[data-radix-scroll-area-viewport]>div]:!block"
    >
      <div className="flex flex-col gap-2 p-3">
        {items.length === 0 && (
          <div className="text-muted-foreground text-xs space-y-1">
            <p>Ask me to create a blotter, add a calculated column, style a column, highlight rows, or set up a data provider.</p>
            <p className="text-[11px]">You can attach a screenshot or a config file — paste, drop, or use the paperclip.</p>
          </div>
        )}

        {items.map((item) => {
          if (item.kind === 'tool') return <ToolCallCard key={item.id} activity={item.activity} />;

          if (item.kind === 'assistant') {
            return (
              <div key={item.id} className="self-start max-w-[95%] rounded-md bg-muted text-foreground px-3 py-1.5">
                <MarkdownMessage text={item.text} />
              </div>
            );
          }

          return (
            <div key={item.id} className="self-end max-w-[85%] flex flex-col items-end gap-1">
              {item.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {item.attachments.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {a.kind === 'image' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span className="max-w-[10rem] truncate">{a.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {item.text && (
                <div className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs whitespace-pre-wrap">
                  {item.text}
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator — only before the first token lands, since after
            that the streaming bubble itself is the progress signal. */}
        {isBusy && !lastIsAssistant && (
          <div className="self-start flex items-center gap-1.5 text-muted-foreground text-xs px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </div>
        )}

        {error && <div className="text-destructive text-xs whitespace-pre-wrap">{error}</div>}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
