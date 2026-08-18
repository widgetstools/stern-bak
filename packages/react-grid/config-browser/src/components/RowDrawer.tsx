/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Textarea } from "@wellsfargo-starui/react";
import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

type Mode = "edit" | "create";

interface RowDrawerProps {
  open: boolean;
  mode: Mode;
  initialRow: any | null;
  primaryKey: string;
  onClose: () => void;
  onSave: (row: any) => Promise<void>;
  onDelete: (id: string | number) => Promise<void>;
}

/**
 * Inline right-docked drawer for row edit / create.
 *
 * Implemented as a positioned sibling of the grid (not a portal), so:
 *   • `--de-*` tokens resolve correctly — it inherits from its parent's
 *     [data-dock-editor] scope.
 *   • There is no tailwind dependency — the child window's stylesheet
 *     doesn't process shadcn classes, which is what broke the previous
 *     Sheet-based implementation.
 *   • The drawer slides in from the right edge of the main pane; it
 *     doesn't darken the grid behind it (no modal overlay) — power
 *     users can still reference cell values while editing.
 *
 * The parent must position itself `relative` (or similar) so this
 * component's `position: absolute` anchors to it.
 */
export function RowDrawer({
  open,
  mode,
  initialRow,
  primaryKey,
  onClose,
  onSave,
  onDelete,
}: RowDrawerProps) {
  const initialJson = useMemo(() => {
    return initialRow ? JSON.stringify(initialRow, null, 2) : "{\n  \n}";
  }, [initialRow]);

  const [jsonText, setJsonText] = useState(initialJson);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setJsonText(initialJson);
    setParseError(null);
    setConfirmDelete(false);
  }, [initialJson, open]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const parsedOk = (() => {
    try {
      JSON.parse(jsonText);
      return true;
    } catch {
      return false;
    }
  })();

  async function handleSave() {
    setSaving(true);
    setParseError(null);
    try {
      const parsed = JSON.parse(jsonText);
      await onSave(parsed);
      onClose();
    } catch (err: any) {
      setParseError(err?.message ?? "Invalid JSON or save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!initialRow) return;
    setSaving(true);
    try {
      await onDelete(initialRow[primaryKey]);
      onClose();
    } catch (err: any) {
      setParseError(err?.message ?? "Delete failed");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  const title =
    mode === "create"
      ? "new"
      : initialRow
        ? String(initialRow[primaryKey] ?? "(unknown)")
        : "";

  // Render even when closed so the slide-out animation can play.
  return (
    <div
      aria-hidden={!open}
      className={[
        'absolute top-0 right-0 bottom-0 z-20 flex w-[min(520px,100%)] flex-col border-l border-[var(--de-border)] bg-[var(--de-bg)] font-[var(--de-font)] text-[var(--de-text)]',
        'transition-transform [transition-duration:220ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        open ? 'translate-x-0 shadow-[var(--de-shadow-lg)] pointer-events-auto' : 'translate-x-full shadow-none pointer-events-none',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--de-border)] bg-[var(--de-bg)]">
        <Icon
          icon={mode === "create" ? "lucide:plus-circle" : "lucide:file-json"}
          className="h-4 w-4 text-[var(--de-accent)]"
        />
        <span className="text-[13px] font-semibold text-[var(--de-text)]">
          {mode === "create" ? "New row" : "Edit row"}
        </span>
        <span className="font-[var(--de-mono)] text-[11px] font-medium text-[var(--de-text-tertiary)] overflow-hidden text-ellipsis whitespace-nowrap">
          {title}
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onClose}
          title="Close"
          className="h-7 w-7 shrink-0 border-[var(--de-border)] bg-transparent text-[var(--de-text-secondary)]"
        >
          <Icon icon="lucide:x" className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col p-[14px] gap-2">
        <div
          id="row-drawer-payload-label"
          className="text-[10px] font-bold tracking-[0.8px] uppercase text-[var(--de-text-tertiary)]"
        >
          JSON payload
        </div>
        <Textarea
          ref={textareaRef}
          // The primary control of the row editor — the only way to change a
          // config row. A sibling heading is not an accessible name, so this
          // was indistinguishable from the toolbar's quick-filter box to any
          // role+name query, assistive tech included.
          aria-labelledby="row-drawer-payload-label"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          className={[
            'min-h-[240px] flex-1 resize-none rounded-[var(--de-radius-sm)] border bg-[var(--de-bg-surface)] p-2.5 font-[var(--de-mono)] text-xs leading-normal text-[var(--de-text)] shadow-none focus-visible:ring-0',
            parsedOk ? 'border-[var(--de-border)]' : 'border-[var(--de-danger)]',
          ].join(' ')}
        />
        {!parsedOk && (
          <div
            className="text-[11px] text-[var(--de-danger)] font-[var(--de-mono)]"
          >
            Invalid JSON — save disabled
          </div>
        )}
        {parseError && (
          <div
            className="text-[11px] text-[var(--de-danger)] font-[var(--de-mono)]"
          >
            {parseError}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-[14px] py-2.5 border-t border-[var(--de-border)] bg-[var(--de-bg)]">
        {mode === "edit" && (
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "outline"}
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className={[
              'h-[30px] px-3 text-xs font-semibold font-[var(--de-font)]',
              confirmDelete
                ? ''
                : 'border-[var(--de-border)] bg-[var(--de-bg-surface)] text-[var(--de-danger)] hover:text-[var(--de-danger)]',
            ].join(' ')}
          >
            {confirmDelete ? "Click to confirm" : "Delete"}
          </Button>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={saving}
          className="h-[30px] px-3 text-xs font-medium font-[var(--de-font)] border-[var(--de-border)] bg-[var(--de-bg-surface)] text-[var(--de-text-secondary)]"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!parsedOk || saving}
          className={[
            'h-[30px] px-4 text-xs font-semibold font-[var(--de-font)]',
            parsedOk
              ? 'bg-[var(--de-accent)] text-[var(--de-accent-foreground)] hover:bg-[var(--de-accent)]'
              : 'bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)]',
          ].join(' ')}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
