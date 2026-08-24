/**
 * Message composer: multiline input, attachment chips, send/stop.
 *
 * Attachments arrive three ways — the paperclip picker, paste (the
 * screenshot path: Win+Shift+S then Ctrl+V), and drop anywhere on the panel
 * (wired by the parent, which calls `addFiles`).
 */
import { useCallback, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Paperclip, Send, Square, X, FileText } from 'lucide-react';
import { Button, Textarea } from '@wellsfargo-starui/react';
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
    <div className="flex flex-col gap-1.5 flex-shrink-0">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[11px]"
            >
              {a.kind === 'image' && a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-4 w-4 rounded object-cover" />
              ) : (
                <FileText className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="max-w-[12rem] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
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
        <Button
          size="icon"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
          className="flex-shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask the assistant…  (Enter to send, Shift+Enter for a new line)"
          rows={1}
          className="min-h-[2.25rem] max-h-40 text-xs resize-none"
        />
        {isBusy ? (
          <Button size="icon" variant="destructive" onClick={onStop} aria-label="Stop" className="flex-shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={send}
            disabled={!text.trim() && attachments.length === 0}
            aria-label="Send"
            className="flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
