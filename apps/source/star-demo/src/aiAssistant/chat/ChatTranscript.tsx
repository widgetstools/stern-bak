/**
 * The scrolling conversation view: user bubbles, markdown assistant
 * replies, and inline tool-activity cards. Auto-scrolls to the bottom as
 * content streams in, unless the user has scrolled up to read history.
 */
import { useEffect, useRef } from 'react';
import { FileText, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { ScrollArea } from '@wellsfargo-starui/react';
import { MarkdownMessage } from './MarkdownMessage';
import { ToolCallCard } from './ToolCallCard';
import type { TranscriptItem } from './useChatSession';
import type { Starter } from './starters';

export interface ChatTranscriptProps {
  items: TranscriptItem[];
  isBusy: boolean;
  error: string | null;
  /** Opening suggestions; clicking one sends it. */
  starters?: readonly Starter[];
  onPickStarter?: (prompt: string) => void;
  /**
   * Fires with a transcript item's id when its data-cell result card is
   * clicked. Curried down to `ToolCallCard` as a bare callback at the `.map`
   * below, where `item.id` (always unique) is in scope — `ToolCallCard`
   * itself never sees an id to get wrong.
   */
  onOpenAnalysis?: (id: string) => void;
}

export function ChatTranscript({ items, isBusy, error, starters, onPickStarter, onOpenAnalysis }: ChatTranscriptProps) {
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
      className="flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block"
    >
      <div className="flex flex-col gap-5 px-1 py-4">
        {items.length === 0 && (
          <div className="py-8 space-y-4">
            <div className="text-muted-foreground text-xs space-y-1.5 text-center">
              <p className="text-foreground/70">Create a blotter, add a calculated column, style a column, highlight rows, or set up a data provider.</p>
              <p className="text-[11px] opacity-70">Attach a screenshot or a config file — paste, drop, or use the paperclip.</p>
            </div>
            {starters && starters.length > 0 && onPickStarter && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {starters.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onPickStarter(s.prompt)}
                    title={s.prompt}
                    className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground hover:border-[color:var(--ds-bot-accent)]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {items.map((item) => {
          if (item.kind === 'tool') {
            // Indented to sit under the nearest assistant avatar above/below —
            // tool activity reads as part of that turn, not a separate voice.
            return (
              <div key={item.id} className="ml-[34px]">
                <ToolCallCard
                  activity={item.activity}
                  onOpenAnalysis={onOpenAnalysis && (() => onOpenAnalysis(item.id))}
                />
              </div>
            );
          }

          if (item.kind === 'assistant') {
            // A small avatar plus a softly-tinted bubble in the bot's own
            // accent — the conversational-UI turn-taking cue a bare-text
            // block doesn't give, without borrowing --primary/--accent.
            return (
              <div key={item.id} className="flex items-start gap-2.5 max-w-[680px]">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[color:var(--ds-bot-accent)] to-[color:var(--ds-bot-accent-deep)] text-white">
                  <Sparkles className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1 rounded-tl-md rounded-2xl border border-[color:var(--ds-bot-accent-border)] bg-[color:var(--ds-bot-accent-soft)] px-3.5 py-2.5 text-foreground">
                  <MarkdownMessage text={item.text} />
                </div>
              </div>
            );
          }

          return (
            <div key={item.id} className="self-end max-w-[85%] flex flex-col items-end gap-1.5">
              {item.attachments.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {item.attachments.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {a.kind === 'image' ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span className="max-w-[10rem] truncate">{a.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {item.text && (
                // Inverted rather than tinted — separates "mine" from "theirs"
                // by weight instead of hue.
                <div className="rounded-2xl rounded-br-md bg-foreground text-background px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                  {item.text}
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator — only before the first token lands, since after
            that the streaming text itself is the progress signal. */}
        {isBusy && !lastIsAssistant && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            {/* Same indigo accent as the header/avatar mark — the assistant is
                doing something, echoed in the same brand colour. */}
            <Loader2 className="h-3 w-3 animate-spin text-[color:var(--ds-bot-accent)]" />
            <span className="opacity-80">Thinking…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground/80 whitespace-pre-wrap">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
