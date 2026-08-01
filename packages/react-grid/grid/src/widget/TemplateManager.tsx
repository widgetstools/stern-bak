/**
 * TemplateManager — unified "saved templates" surface used by both
 * the in-grid FormattingToolbar's template popover AND the popped-out
 * FormattingPropertiesPanel's Templates section.
 *
 * UX (redesigned 2026-05-03):
 *   ┌────────────────────────────────────────┐
 *   │  Bold              [✏] [⟳] [🗑]        │ ← rows; click body = apply,
 *   │ ✓ Currency         [✏] [⟳] [🗑]        │   actions hover-revealed
 *   │  …                                      │
 *   ├────────────────────────────────────────┤
 *   │  Save current as: [name…]      [+]     │
 *   ├────────────────────────────────────────┤
 *   │  Will save: Styles · Formatter · Filter │ ← "what's in the snapshot" hint
 *   └────────────────────────────────────────┘
 *
 * The per-row UPDATE button lets users re-snapshot the active column
 * INTO an existing template — the user-requested "save additional
 * settings to an existing template" affordance. RENAME swaps the row
 * label into an inline input. DELETE uses a two-step confirm
 * (mousedown-to-arm, click-to-commit) to defeat single-misclick
 * destruction.
 *
 * One implementation powers both surfaces via `variant`:
 *   - `compact`  — toolbar popover (~320px, denser rows)
 *   - `panel`    — popped-out properties panel (full-width)
 */

import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, RotateCw, Trash2, Check, X } from 'lucide-react';
import { GhostIconButton, Input, ChromeButton, cn } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wellsfargo-starui/react';

// Inactive-row hover tint. Co-located here (instead of marketsGrid.css)
// so the row + its buttons stay self-contained — the row also serves
// as `data-row-hover-target` for the GhostIconButton reveal, so its
// hover feedback is part of the same primitive's behaviour. Idempotent
// + SSR-safe per the same pattern GhostIconButton uses.
const ROW_STYLE_ID = 'ds-tpl-row-styles';
if (typeof document !== 'undefined' && !document.getElementById(ROW_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = ROW_STYLE_ID;
  style.textContent = `
    .ds-tpl-row:not([data-active='true']):hover {
      background: color-mix(in srgb, var(--ds-text-primary) 5%, transparent) !important;
    }
  `;
  document.head.appendChild(style);
}

export interface TemplateManagerProps {
  templates: ReadonlyArray<{ id: string; name: string }>;
  activeTemplateId?: string;
  disabled?: boolean;

  // Save-as — controlled input (owner decides where the draft lives).
  saveName: string;
  saveConfirmed: boolean;
  onSaveNameChange: (value: string) => void;
  onSave: () => void;

  onApply: (id: string) => void;
  onDelete: (id: string) => void;

  /** Re-snapshot the active column and overwrite an existing template.
   *  Omit to hide the per-row Update affordance. */
  onUpdate?: (id: string) => void;
  /** Rename an existing template inline. Omit to hide the per-row
   *  Rename affordance. Implementations should call the formatter's
   *  `renameTemplate(id, newName)` action. */
  onRename?: (id: string, name: string) => void;

  /**
   * Optional human-readable list of template categories the active
   * column can currently save (e.g. `['Styles', 'Formatter', 'Filter']`).
   * Renders as a small caption beneath the save row so users know
   * what the snapshot will capture BEFORE clicking save. Empty array
   * => the column has nothing template-eligible.
   */
  capturableFields?: ReadonlyArray<string>;

  /** Layout variant. `compact` = popover inside toolbar (320px,
   *  tighter spacing); `panel` = full-width Section inside the
   *  popped-out Properties panel. */
  variant?: 'compact' | 'panel';

  /** Optional test-id prefix applied to interactive elements so E2E
   *  can assert on the same primitive regardless of variant. */
  testIdPrefix?: string;
}

interface RowProps {
  id: string;
  name: string;
  isActive: boolean;
  isRenaming: boolean;
  renameDraft: string;
  pendingDeleteId: string | null;
  disabled: boolean;
  hasUpdate: boolean;
  hasRename: boolean;
  onApply: () => void;
  onUpdate: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRenameDraftChange: (v: string) => void;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  testId: string;
}

function TemplateRow({
  id,
  name,
  isActive,
  isRenaming,
  renameDraft,
  pendingDeleteId,
  disabled,
  hasUpdate,
  hasRename,
  onApply,
  onUpdate,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRenameDraftChange,
  onArmDelete,
  onConfirmDelete,
  testId,
}: RowProps) {
  const isPendingDelete = pendingDeleteId === id;

  return (
    <div
      data-testid={testId}
      data-row-hover-target=""
      data-active={isActive ? 'true' : undefined}
      className="ds-tpl-row"
      role="button"
      tabIndex={isRenaming ? -1 : 0}
      onClick={() => { if (!isRenaming && !isPendingDelete && !disabled) onApply(); }}
      onKeyDown={(e) => {
        if (isRenaming) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) onApply();
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 6px 0 10px',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: isActive
          ? 'color-mix(in srgb, var(--ds-primary) 10%, transparent)'
          : 'transparent',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms',
        outline: 'none',
      }}
    >
      {/* Active accent bar */}
      <span
        aria-hidden
        style={{
          position: 'absolute', left: 2, top: 6, bottom: 6,
          width: 2, borderRadius: 2,
          background: isActive ? 'var(--ds-primary)' : 'transparent',
        }}
      />

      {/* Leading check / dot */}
      <span className="inline-flex items-center justify-center w-3 h-3 shrink-0">
        {isActive ? (
          <Check size={11} strokeWidth={2.5} className="text-[var(--ds-primary)]" />
        ) : (
          <span className="w-[5px] h-[5px] rounded-full bg-[color-mix(in_srgb,var(--ds-text-muted)_50%,transparent)]" />
        )}
      </span>

      {/* Name — switches to input while renaming */}
      {isRenaming ? (
        <Input
          type="text"
          value={renameDraft}
          autoFocus
          data-testid={`${testId}-rename-input`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); onCommitRename(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
          }}
          onBlur={onCommitRename}
          className="h-[22px] min-h-[22px] flex-1 min-w-0 rounded-[2px] border-[color-mix(in_srgb,var(--ds-primary)_55%,var(--ds-border-primary))] bg-[color:var(--ds-surface-ground)] px-1.5 text-[11px] text-[color:var(--ds-text-primary)] shadow-none focus-visible:ring-0 data-[active=true]:font-semibold"
          data-active={isActive ? 'true' : undefined}
        />
      ) : (
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 11,
          fontWeight: isActive ? 600 : 450,
          color: 'var(--ds-text-primary)',
          letterSpacing: 0.1,
        }}>
          {name}
        </span>
      )}

      {/* Action buttons — hover-revealed via GhostIconButton's
          `reveal="on-row-hover"` (the row sets `data-row-hover-target`).
          The pending-delete + renaming branches force `revealed` so
          actions stay visible while a multi-step flow is in progress. */}
      {!isRenaming && (
        <>
          {hasUpdate && (
            <GhostIconButton
              reveal="on-row-hover"
              revealed={isPendingDelete}
              variant="accent"
              onClick={(e) => { e.stopPropagation(); onUpdate(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Update "${name}" with the current column's settings`}
              aria-label={`Update template ${name}`}
              data-testid={`${testId}-update`}
            >
              <RotateCw size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
          {hasRename && (
            <GhostIconButton
              reveal="on-row-hover"
              revealed={isPendingDelete}
              variant="accent"
              onClick={(e) => { e.stopPropagation(); onStartRename(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Rename "${name}"`}
              aria-label={`Rename template ${name}`}
              data-testid={`${testId}-rename`}
            >
              <Pencil size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
          {isPendingDelete ? (
            <ChromeButton
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
              onMouseDown={(e) => e.preventDefault()}
              data-testid={`${testId}-delete-confirm`}
              title="Click to confirm delete"
              aria-label="Confirm delete template"
              className="inline-flex h-[22px] shrink-0 items-center justify-center gap-1 rounded-[3px] border border-[var(--ds-accent-negative)] bg-[color-mix(in_srgb,var(--ds-accent-negative)_18%,transparent)] px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ds-accent-negative)]"
            >
              <Trash2 size={10} strokeWidth={2.25} />
              <span>Delete</span>
            </ChromeButton>
          ) : (
            <GhostIconButton
              reveal="on-row-hover"
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); onArmDelete(); }}
              onMouseDown={(e) => e.preventDefault()}
              title={`Delete "${name}"`}
              aria-label={`Delete template ${name}`}
              data-testid={`${testId}-delete`}
            >
              <Trash2 size={11} strokeWidth={2} />
            </GhostIconButton>
          )}
        </>
      )}

      {/* Cancel-rename — mousedown so it fires before the input's
          blur-commits handler. Always-visible (the input owns the
          row's left edge; this button needs to stay reachable). */}
      {isRenaming && (
        <GhostIconButton
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancelRename();
          }}
          data-testid={`${testId}-rename-cancel`}
          title="Cancel rename"
          aria-label="Cancel rename"
        >
          <X size={11} strokeWidth={2} />
        </GhostIconButton>
      )}
    </div>
  );
}

export function TemplateManager({
  templates,
  activeTemplateId,
  disabled,
  saveName,
  saveConfirmed,
  onSaveNameChange,
  onSave,
  onApply,
  onDelete,
  onUpdate,
  onRename,
  capturableFields,
  variant = 'panel',
  testIdPrefix = 'tpl',
}: TemplateManagerProps) {
  const isCompact = variant === 'compact';
  const isEmpty = templates.length === 0;
  const activeTpl = templates.find((t) => t.id === activeTemplateId);

  // Inline rename state — at most one row in edit mode at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Two-step delete state — armed-row id, auto-disarmed after 3s OR
  // when the template list changes.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disarmDelete = () => {
    setPendingDeleteId(null);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
  };
  const armDelete = (id: string) => {
    setPendingDeleteId(id);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  };
  useEffect(() => () => { if (armTimerRef.current) clearTimeout(armTimerRef.current); }, []);

  // Disarm delete + cancel any in-flight rename whenever the template
  // list shape changes — otherwise stale state can target a row that
  // no longer exists.
  useEffect(() => {
    disarmDelete();
    if (renamingId && !templates.some((t) => t.id === renamingId)) {
      setRenamingId(null);
      setRenameDraft('');
    }
    // Reason: we only want this effect to react to the SIZE of the
    // template list changing (add/delete), not to identity churn on
    // every individual template update. Listing `templates` (full
    // array), `renamingId`, or `disarmDelete` would re-fire on
    // unrelated rename / hover events and cancel an in-progress rename.
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [templates.length]);

  const startRename = (id: string, currentName: string) => {
    disarmDelete();
    setRenamingId(id);
    setRenameDraft(currentName);
  };
  const commitRename = () => {
    const id = renamingId;
    if (!id) return;
    const trimmed = renameDraft.trim();
    const tpl = templates.find((t) => t.id === id);
    setRenamingId(null);
    setRenameDraft('');
    if (!trimmed || !tpl || tpl.name === trimmed) return;
    onRename?.(id, trimmed);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const confirmDelete = (id: string) => {
    disarmDelete();
    onDelete(id);
  };

  return (
    <div
      data-testid={`${testIdPrefix}-manager`}
      className="flex flex-col gap-1.5"
      style={{
        minWidth: isCompact ? 320 : undefined,
        width: isCompact ? undefined : '100%',
      }}
    >
      {/* Compact toolbar: scrolling row list (bounded inside its popover). */}
      {!isEmpty && isCompact && (
        <div
          data-testid={`${testIdPrefix}-list`}
          className="flex flex-col gap-px max-h-60 overflow-y-auto pr-0.5"
        >
          {templates.map((tpl) => (
            <TemplateRow
              key={tpl.id}
              id={tpl.id}
              name={tpl.name}
              isActive={tpl.id === activeTemplateId}
              isRenaming={renamingId === tpl.id}
              renameDraft={renameDraft}
              pendingDeleteId={pendingDeleteId}
              disabled={!!disabled}
              hasUpdate={!!onUpdate}
              hasRename={!!onRename}
              onApply={() => onApply(tpl.id)}
              onUpdate={() => onUpdate?.(tpl.id)}
              onStartRename={() => startRename(tpl.id, tpl.name)}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onRenameDraftChange={setRenameDraft}
              onArmDelete={() => armDelete(tpl.id)}
              onConfirmDelete={() => confirmDelete(tpl.id)}
              testId={`${testIdPrefix}-row-${tpl.id}`}
            />
          ))}
        </div>
      )}

      {/* Popped-out panel: a Select (pick = apply) + an action cluster for
          the chosen template. Fixed height — the section no longer grows as
          templates accumulate. */}
      {!isEmpty && !isCompact && (
        <div className="flex items-center gap-1.5" data-testid={`${testIdPrefix}-picker`}>
          {renamingId && activeTpl ? (
            <Input
              type="text"
              autoFocus
              value={renameDraft}
              data-testid={`${testIdPrefix}-rename-input`}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
              }}
              onBlur={commitRename}
              className="h-8 min-h-8 flex-1 min-w-0 rounded-[2px] text-[11px]"
            />
          ) : (
            <Select
              value={activeTemplateId ?? ''}
              onValueChange={(id) => onApply(id)}
              disabled={disabled}
            >
              <SelectTrigger
                data-testid={`${testIdPrefix}-select`}
                aria-label="Saved templates"
                className="h-8 min-h-8 flex-1 min-w-0 rounded-[2px] text-[11px]"
              >
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem
                    key={tpl.id}
                    value={tpl.id}
                    data-testid={`${testIdPrefix}-option-${tpl.id}`}
                    className="text-[11px]"
                  >
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Actions for the selected template. Disabled until one is chosen. */}
          {!renamingId && (
            <div className="flex shrink-0 items-center gap-1">
              {onUpdate && (
                <GhostIconButton
                  variant="accent"
                  disabled={disabled || !activeTpl}
                  onClick={() => activeTpl && onUpdate(activeTpl.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Update the selected template with the current column's settings"
                  aria-label="Update selected template"
                  data-testid={`${testIdPrefix}-update-btn`}
                >
                  <RotateCw size={12} strokeWidth={2} />
                </GhostIconButton>
              )}
              {onRename && (
                <GhostIconButton
                  variant="accent"
                  disabled={disabled || !activeTpl}
                  onClick={() => activeTpl && startRename(activeTpl.id, activeTpl.name)}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Rename the selected template"
                  aria-label="Rename selected template"
                  data-testid={`${testIdPrefix}-rename-btn`}
                >
                  <Pencil size={12} strokeWidth={2} />
                </GhostIconButton>
              )}
              {pendingDeleteId && pendingDeleteId === activeTemplateId ? (
                <ChromeButton
                  type="button"
                  onClick={() => activeTpl && confirmDelete(activeTpl.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  data-testid={`${testIdPrefix}-delete-confirm`}
                  title="Click to confirm delete"
                  aria-label="Confirm delete template"
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-[3px] border border-[var(--ds-accent-negative)] bg-[color-mix(in_srgb,var(--ds-accent-negative)_18%,transparent)] px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ds-accent-negative)]"
                >
                  <Trash2 size={11} strokeWidth={2.25} />
                  <span>Delete</span>
                </ChromeButton>
              ) : (
                <GhostIconButton
                  variant="destructive"
                  disabled={disabled || !activeTpl}
                  onClick={() => activeTpl && armDelete(activeTpl.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  title="Delete the selected template"
                  aria-label="Delete selected template"
                  data-testid={`${testIdPrefix}-delete-btn`}
                >
                  <Trash2 size={12} strokeWidth={2} />
                </GhostIconButton>
              )}
            </div>
          )}

          {renamingId && (
            <GhostIconButton
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); cancelRename(); }}
              title="Cancel rename"
              aria-label="Cancel rename"
              data-testid={`${testIdPrefix}-rename-cancel`}
            >
              <X size={12} strokeWidth={2} />
            </GhostIconButton>
          )}
        </div>
      )}

      {/* Separator — only when both list and footer have content. */}
      {!isEmpty && (
        <div className="h-px bg-[color-mix(in_srgb,var(--ds-border-primary)_60%,transparent)] my-0.5" />
      )}

      {/* Save-as footer */}
      <div>
        <div className="text-[9px] font-semibold tracking-[0.6px] uppercase text-muted-foreground mb-1">
          Save current as new
        </div>
        <div className="flex gap-1.5">
          <Input
            type="text"
            value={saveName}
            onChange={(e) => onSaveNameChange(e.target.value)}
            placeholder={isEmpty ? 'Save your first template…' : 'Template name…'}
            disabled={disabled}
            data-testid={`${testIdPrefix}-save-input`}
            aria-label="New template name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveName.trim()) onSave();
            }}
            className="h-7 min-h-7 flex-1 min-w-0 rounded-[3px] text-[11px]"
          />
          <ChromeButton
            type="button"
            disabled={disabled || !saveName.trim()}
            onClick={onSave}
            onMouseDown={(e) => e.preventDefault()}
            data-testid={`${testIdPrefix}-save-btn`}
            title="Save current state as new template"
            aria-label="Save current state as new template"
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border p-0 transition-all [transition-duration:120ms]',
              saveConfirmed
                ? 'border-[color-mix(in_srgb,var(--ds-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--ds-primary)_14%,transparent)] text-[var(--ds-primary)]'
                : 'border-[var(--ds-border-primary)] bg-transparent text-[var(--ds-text-secondary)]',
              (disabled || !saveName.trim()) && 'cursor-not-allowed opacity-30',
            )}
          >
            {saveConfirmed ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} strokeWidth={2} />}
          </ChromeButton>
        </div>
      </div>

      {/* "What will be saved" hint — surfaces the captured-fields
          summary so the user knows what the snapshot includes BEFORE
          clicking save. Hidden when nothing is capturable (empty
          column) or the host didn't pass the prop. */}
      {capturableFields && capturableFields.length > 0 && (
        <div
          data-testid={`${testIdPrefix}-capture-hint`}
          className="text-[10px] text-muted-foreground leading-[1.4] pt-0.5"
        >
          Will save: <span className="text-[var(--ds-text-secondary)] font-medium">
            {capturableFields.join(' · ')}
          </span>
        </div>
      )}

      {/* Empty-state hint — shown when no templates exist yet. */}
      {isEmpty && (
        <div
          data-testid={`${testIdPrefix}-empty-hint`}
          className="text-[10px] text-muted-foreground leading-[1.4] pt-0.5"
        >
          Name a style, then click <span className="font-semibold text-[var(--ds-text-secondary)]">+</span> to save your first template.
        </div>
      )}
    </div>
  );
}
