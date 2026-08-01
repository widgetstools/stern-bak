import { useEffect, useRef, useState, memo } from 'react';
import { ChevronDown, Check, Plus, Trash2, Lock, User, Download, Upload, Copy, Pencil, X } from 'lucide-react';
import { RESERVED_DEFAULT_PROFILE_ID, type ProfileMeta } from '@wellsfargo-starui/core';
// styles stay inline (see ProfileSelector.css for rationale).
import './ProfileSelector.css';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  GhostIconButton,
  buttonVariants,
  Input,
  ChromeButton,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export interface ProfileSelectorProps {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isDirty: boolean;
  onCreate: (name: string) => void | Promise<unknown>;
  onLoad: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called per-profile from the row's clone button. Suggested
   * implementation: `return cloneProfile(sourceId, name)` so the picker
   * can keep the popover open and drop into inline rename on the clone.
   * Omit to hide the clone affordance.
   */
  onClone?: (id: string) => void | Promise<ProfileMeta | void>;
  /**
   * Optional: called when the user finishes inline-renaming a profile
   * row. Receives the profile id and the trimmed new name. Implementations
   * should dispatch `renameProfile(id, name)`. Omit to hide the rename
   * affordance. The reserved Default profile is never renameable.
   */
  onRename?: (id: string, name: string) => void | Promise<unknown>;
  /**
   * Optional: called per-profile from the row's download button AND from the
   * footer "Export active" action. Implementations should download a JSON
   * file. Omit to hide the export affordances.
   */
  onExport?: (id: string) => void | Promise<unknown>;
  /**
   * Optional: called from the footer "Import…" action with a File the user
   * picked. Implementations should parse the JSON and call the profile
   * manager's importProfile. Omit to hide the import affordance.
   */
  onImport?: (file: File) => void | Promise<unknown>;
}

/**
 * Compact profile picker for the toolbar. Built on the shared shadcn Popover
 * so outside-click, Escape, portal rendering, and collision detection are
 * consistent with the rest of the app.
 */
export function ProfileSelectorInner({
  profiles,
  activeProfileId,
  isDirty,
  onCreate,
  onLoad,
  onDelete,
  onClone,
  onRename,
  onExport,
  onImport,
}: ProfileSelectorProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Blocks Radix dismiss while clone async runs or inline rename is active. */
  const blockPopoverDismissRef = useRef(false);
  /** When the host omits a return value, pick up the activated clone row. */
  const awaitingCloneRenameRef = useRef(false);
  // Pending-delete drives the shadcn AlertDialog. We track the FULL row
  // (not just the id) so the dialog can render the profile's display name
  // without having to re-lookup from `profiles` after the delete has
  // already removed it from the list.
  const [pendingDelete, setPendingDelete] = useState<ProfileMeta | null>(null);

  const active = profiles.find((p) => p.id === activeProfileId);
  const triggerLabel = active?.name ?? 'No layout';
  const canCreate = newName.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    await onCreate(newName.trim());
    setNewName('');
    setOpen(false);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const commitRename = async () => {
    if (!renamingId || !onRename) return cancelRename();
    const target = profiles.find((p) => p.id === renamingId);
    const next = renameDraft.trim();
    // No-op when blank or unchanged — quietly cancel rather than fire a
    // pointless write.
    if (!next || (target && next === target.name)) return cancelRename();
    const id = renamingId;
    cancelRename();
    try {
      await onRename(id, next);
    } catch (err) {
      console.warn('[markets-grid] profile rename failed:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    // Close the dialog before awaiting the delete so focus returns to the
    // trigger cleanly and Radix doesn't fight us over focus restoration.
    setPendingDelete(null);
    await onDelete(target.id);
  };

  useEffect(() => {
    blockPopoverDismissRef.current =
      renamingId != null || awaitingCloneRenameRef.current;
  }, [renamingId]);

  useEffect(() => {
    if (!awaitingCloneRenameRef.current || !open) return;
    const active = profiles.find((p) => p.id === activeProfileId);
    if (!active) return;
    setRenamingId(active.id);
    setRenameDraft(active.name);
    awaitingCloneRenameRef.current = false;
    blockPopoverDismissRef.current = true;
  }, [profiles, activeProfileId, open]);

  useEffect(() => {
    if (!renamingId) return;
    setOpen(true);
    const row = listRef.current?.querySelector(
      `[data-testid="profile-row-${renamingId}"]`,
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [renamingId]);

  const handlePopoverOpenChange = (next: boolean) => {
    if (!next && shouldBlockPopoverDismiss()) return;
    setOpen(next);
    if (!next) cancelRename();
  };

  const shouldBlockPopoverDismiss = () =>
    blockPopoverDismissRef.current
    || renamingId != null
    || awaitingCloneRenameRef.current;

  const handleClone = async (sourceId: string) => {
    if (!onClone) return;
    blockPopoverDismissRef.current = true;
    awaitingCloneRenameRef.current = true;
    setOpen(true);
    try {
      const cloned = await onClone(sourceId);
      if (cloned?.id) {
        awaitingCloneRenameRef.current = false;
        setRenamingId(cloned.id);
        setRenameDraft(cloned.name);
        setOpen(true);
      }
    } catch {
      awaitingCloneRenameRef.current = false;
      blockPopoverDismissRef.current = false;
    }
  };

  return (
    <div className="ds-profile-selector">
      <Popover open={open} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          <ChromeButton
            type="button"
            className="ds-ps-trigger"
            data-empty={active ? 'false' : 'true'}
            data-open={open ? 'true' : 'false'}
            aria-expanded={open}
            title={active ? (isDirty ? `${active.name} (unsaved changes)` : active.name) : 'Select or create a layout'}
            data-testid="profile-selector-trigger"
          >
            <span className="ds-ps-trigger-icon-badge" aria-hidden>
              <User size={10} strokeWidth={2.25} />
            </span>
            <span className="ds-ps-trigger-label">{triggerLabel}</span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className="ds-ps-trigger-chevron"
              data-open={open ? 'true' : 'false'}
            />
          </ChromeButton>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          data-testid="profile-selector-popover"
          className="ds-ps-shell !p-0 !w-auto"
          onFocusOutside={(e) => {
            if (shouldBlockPopoverDismiss()) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (shouldBlockPopoverDismiss()) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (shouldBlockPopoverDismiss()) e.preventDefault();
          }}
        >
          {/* Header */}
          <div className="ds-ps-header">
            <span className="ds-ps-header-label">Layouts</span>
            <span className="ds-ps-header-count">{profiles.length}</span>
          </div>

          {/* List */}
          <div ref={listRef} className="ds-ps-list">
            {profiles.length === 0 ? (
              <div className="ds-ps-empty">
                No layouts yet — create one below
              </div>
            ) : profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              const isReserved = p.id === RESERVED_DEFAULT_PROFILE_ID;
              const isRenaming = renamingId === p.id;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`profile-row-${p.id}`}
                  data-row-hover-target=""
                  className="ds-ps-row"
                  data-active={isActive ? 'true' : undefined}
                  onClick={() => { if (!isRenaming) { onLoad(p.id); setOpen(false); } }}
                  onKeyDown={(e) => { if (!isRenaming && e.key === 'Enter') { onLoad(p.id); setOpen(false); } }}
                >
                  <span aria-hidden className="ds-ps-row-accent" />

                  {/* Leading indicator */}
                  <span className="ds-ps-row-indicator">
                    {isActive ? (
                      <Check size={12} strokeWidth={2.5} className="text-[var(--ds-primary)]" />
                    ) : (
                      <span className="ds-ps-row-dot" />
                    )}
                  </span>

                  {/* Name — switches to inline input while renaming */}
                  {isRenaming ? (
                    <Input
                      type="text"
                      value={renameDraft}
                      autoFocus
                      data-testid={`profile-rename-input-${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                      }}
                      onBlur={() => { void commitRename(); }}
                      className="h-[22px] min-h-[22px] flex-1 min-w-0 rounded-[2px] border-[color-mix(in_srgb,var(--ds-primary)_55%,var(--ds-border-primary))] bg-[color:var(--ds-surface-ground)] px-1.5 text-[11px] font-[450] tracking-[0.1px] text-[color:var(--ds-text-primary)] shadow-none focus-visible:ring-0 data-[active=true]:font-semibold"
                      data-active={isActive ? 'true' : undefined}
                    />
                  ) : (
                    <span className="ds-ps-row-name" title={p.name}>
                      {p.name}
                    </span>
                  )}

                  {/* Dirty dot beside active row name */}
                  {isActive && isDirty && (
                    <span
                      title="Unsaved changes"
                      aria-label="unsaved"
                      className="w-1.5 h-1.5 rounded-full bg-[var(--ds-accent-warning)] shrink-0"
                    />
                  )}

                  {/* Reserved-default lock — a status indicator (not an
                      action), so it stays in flow and is always visible. */}
                  {isReserved && !isRenaming && (
                    <span
                      title="Built-in default layout"
                      className="ds-ps-row-lock"
                    >
                      <Lock size={12} strokeWidth={2.25} />
                    </span>
                  )}

                  {/* Cancel-rename button — only rendered while this row
                      is in edit mode. Mousedown (not click) so it fires
                      before the input's blur-commits handler. */}
                  {isRenaming && (
                    <GhostIconButton
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelRename();
                      }}
                      title="Cancel rename"
                      aria-label="Cancel rename"
                      data-testid={`profile-rename-cancel-${p.id}`}
                    >
                      <X size={12} strokeWidth={2.25} />
                    </GhostIconButton>
                  )}

                  {/* Hover action cluster — absolutely positioned over the
                      row's right edge so the layout name keeps the FULL row
                      width at rest (otherwise these trailing icons reserve
                      layout space and collapse the flex name column to a
                      single character). The cluster + a short fade mask
                      reveal together on row hover / keyboard focus. */}
                  {!isRenaming && (onRename || onClone || onExport || !isReserved) && (
                    <div className="ds-ps-row-actions" aria-hidden={false}>
                      {/* Per-row rename — switches the row into inline-edit
                          mode. Hidden for the reserved Default profile. */}
                      {onRename && !isReserved && (
                        <GhostIconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(p.id);
                            setRenameDraft(p.name);
                          }}
                          title={`Rename "${p.name}"`}
                          aria-label={`Rename layout ${p.name}`}
                          data-testid={`profile-rename-${p.id}`}
                        >
                          <Pencil size={12} strokeWidth={2.25} />
                        </GhostIconButton>
                      )}

                      {/* Per-row clone — duplicates the profile and activates it. */}
                      {onClone && (
                        <GhostIconButton
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleClone(p.id);
                          }}
                          title={`Clone "${p.name}"`}
                          aria-label={`Clone layout ${p.name}`}
                          data-testid={`profile-clone-${p.id}`}
                        >
                          <Copy size={12} strokeWidth={2.25} />
                        </GhostIconButton>
                      )}

                      {/* Per-row export */}
                      {onExport && (
                        <GhostIconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            onExport(p.id);
                          }}
                          title={`Export "${p.name}" as JSON`}
                          aria-label={`Export layout ${p.name}`}
                          data-testid={`profile-export-${p.id}`}
                        >
                          <Download size={12} strokeWidth={2.25} />
                        </GhostIconButton>
                      )}

                      {/* Per-row delete (never for the reserved Default). */}
                      {!isReserved && (
                        <GhostIconButton
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Close the profile popover as we open the confirm
                            // dialog — otherwise clicks inside the dialog would
                            // fall through to the popover's dismiss layer and
                            // race with the AlertDialog's focus trap.
                            setOpen(false);
                            setPendingDelete(p);
                          }}
                          title="Delete layout"
                          aria-label={`Delete layout ${p.name}`}
                        >
                          <Trash2 size={12} strokeWidth={2.25} />
                        </GhostIconButton>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer — Save current as + (optional) Export / Import.
              Sits below the scrolling list, never scrolls itself. */}
          <div className="ds-ps-footer">
          {/* Create new */}
          <div className="ds-ps-create-section">
            <div
              className="ds-ps-create-field"
              data-focused={inputFocused ? 'true' : 'false'}
            >
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setNewName(''); (e.currentTarget as HTMLInputElement).blur(); }
                }}
                placeholder="New layout name"
                autoFocus={!renamingId}
                data-testid="profile-name-input"
                className="h-[30px] min-h-[30px] flex-1 min-w-0 rounded-none border-none bg-transparent px-2.5 text-[11px] tracking-[0.1px] text-[color:var(--ds-text-primary)] shadow-none focus-visible:ring-0"
              />
              <ChromeButton
                type="button"
                className="ds-ps-save-btn"
                onClick={handleCreate}
                disabled={!canCreate}
                title="Save current state as new layout"
                data-testid="profile-create-btn"
              >
                <Plus size={12} strokeWidth={2.25} />
                Save
              </ChromeButton>
            </div>
          </div>

          {/* Import / Export row — rendered only when the host wired the
              callbacks. Keeps the popover compact for consumers that don't
              need the feature. */}
          {(onExport || onImport) && (
            <>
              <div className="h-px bg-[color-mix(in_srgb,var(--ds-border-primary)_60%,transparent)]" />
              <div className="ds-ps-io-row">
                {onExport && (
                  <ChromeButton
                    type="button"
                    className="ds-ps-io-btn"
                    onClick={() => { onExport(activeProfileId); }}
                    title="Export the active layout to a JSON file"
                    data-testid="profile-export-active-btn"
                  >
                    <Download size={12} strokeWidth={1.75} />
                    Export
                  </ChromeButton>
                )}
                {onImport && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      data-testid="profile-import-file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void onImport(file);
                        e.target.value = '';
                        setOpen(false);
                      }}
                    />
                    <ChromeButton
                      type="button"
                      className="ds-ps-io-btn"
                      onClick={() => fileInputRef.current?.click()}
                      title="Import a layout from a JSON file"
                      data-testid="profile-import-btn"
                    >
                      <Upload size={12} strokeWidth={1.75} />
                      Import
                    </ChromeButton>
                  </>
                )}
              </div>
            </>
          )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete-profile confirmation — shadcn AlertDialog replaces the
          native window.confirm so the flow matches the rest of the app's
          design system AND doesn't block the renderer while the prompt
          is open (window.confirm freezes everything including pending
          React effects and IndexedDB reads). */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(nextOpen: boolean) => { if (!nextOpen) setPendingDelete(null); }}
      >
        <AlertDialogContent data-testid="profile-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete layout?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name ?? ''}&quot; will be permanently removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-delete-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={handleConfirmDelete}
              data-testid="profile-delete-confirm-btn"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const ProfileSelector = memo(ProfileSelectorInner);
