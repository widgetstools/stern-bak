/**
 * Message composer: multiline input, attachment chips, send/stop.
 *
 * Attachments arrive three ways — the paperclip picker, paste (the
 * screenshot path: Win+Shift+S then Ctrl+V), and drop anywhere on the panel
 * (wired by the parent, which calls `addFiles`).
 */
import { useCallback, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Paperclip, Send, Square, X, FileText } from 'lucide-react';
import { Button, Textarea, cn } from '@wellsfargo-starui/react';
import { filesFromDataTransfer, type Attachment } from './attachments';

export interface ComposerProps {
  attachments: Attachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isBusy: boolean;
  /** Previously sent messages, newest last — recalled with ArrowUp. */
  history: string[];
}

export function Composer({
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onSend,
  onStop,
  isBusy,
  history,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isBusy) return;
    onSend(trimmed);
    setText('');
    setHistoryIndex(null);
  }, [text, attachments.length, isBusy, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
        return;
      }
      // ArrowUp recalls previous messages, but only from an empty box (or
      // while already browsing) so it doesn't hijack normal text editing.
      if (e.key === 'ArrowUp' && history.length > 0 && (text === '' || historyIndex !== null)) {
        e.preventDefault();
        const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setText(history[next] ?? '');
        return;
      }
      if (e.key === 'ArrowDown' && historyIndex !== null) {
        e.preventDefault();
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(null);
          setText('');
        } else {
          setHistoryIndex(next);
          setText(history[next] ?? '');
        }
      }
    },
    [send, history, historyIndex, text],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = filesFromDataTransfer(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );

  return (
    // One bordered "island" holding chips, the field and its actions — the
    // field reads as part of the surface instead of a boxed control in a row.
    // While the assistant is responding, the island picks up its accent as a
    // quiet glow — a live cue that doesn't rely on the disabled-looking send
    // button alone.
    <div
      className={cn(
        'flex-shrink-0 rounded-2xl border bg-card/40 transition-colors',
        isBusy
          ? 'border-[color:var(--ds-bot-accent-border)] shadow-[0_0_0_3px_var(--ds-bot-accent-ring)]'
          : 'border-border focus-within:border-border-strong',
      )}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px]"
            >
              {a.kind === 'image' && a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-4 w-4 rounded object-cover grayscale" />
              ) : (
                <FileText className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="max-w-[12rem] truncate text-foreground/80">{a.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onAddFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Ask the assistant…  (Enter to send, Shift+Enter for a new line)"
        rows={1}
        className="min-h-[2.5rem] max-h-40 resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-xs leading-relaxed shadow-none focus-visible:ring-0"
      />

      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-center gap-2">
          {/* Only while composing — an always-on hint is chrome the user
              stops reading after the first message. */}
          {text.trim().length > 0 && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground/70">
              Enter to send · Shift+Enter for a new line
            </span>
          )}
          {isBusy ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onStop}
              aria-label="Stop"
              className="h-7 w-7 rounded-full border border-border text-foreground hover:bg-muted"
            >
              <Square className="h-3 w-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={send}
              disabled={!text.trim() && attachments.length === 0}
              aria-label="Send"
              className="h-7 w-7 rounded-full bg-[color:var(--ds-bot-accent)] text-[color:var(--ds-bot-accent-foreground)] hover:opacity-90 disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
