/**
 * DataProviderEditor — outer shell with a list (left) + form (right).
 *
 * Routes ARE NOT used here; the popout opens this component directly
 * with an optional `initialProviderId`. The list is reactive — when
 * the form saves, the list refresh()es so the new row pops in.
 *
 * Layout: viewport-fit. Outer container is `overflow: hidden`. The
 * left list owns its own scroll; the right pane delegates scrolling
 * to the form's tab bodies.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger, Input, Label, ScrollArea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@wellsfargo-starui/react';
import { Database, Copy, Globe, Plus, Radio, Search, Trash2, TestTube2, Upload } from 'lucide-react';
import type { DataProviderConfig, TransportConfig, ProviderType } from '@wellsfargo-starui/types/shared';
import { getDefaultProviderConfig, validateProviderConfig } from '@wellsfargo-starui/types/shared';
import { useDataServices, useDataProvidersList } from '@wellsfargo-starui/react/data/runtime';
import { cloneProviderConfig } from './cloneProviderConfig.js';
import { parseProviderConfigImport, type PortableProviderConfig } from './providerConfigIo.js';
import { buildProviderSidebarConfigs, isDraftListId, providerMatchesSearch, toDraftListId } from './providerSidebarList.js';
import { EditorForm } from './EditorForm.js';

// ─── Provider-type defaults — keep MINIMAL; everything else is
//      filled in via the form's per-transport components ──────────

const PROVIDER_TYPE_META: Record<ProviderType, { label: string; description: string; icon: typeof Database }> = {
  stomp: { label: 'STOMP', description: 'WebSocket streaming with snapshot + delta semantics.', icon: Radio },
  'stomp-ssrm': {
    label: 'STOMP SSRM',
    description: 'STOMP feed with server-side row model (filter/sort/group in the SharedWorker).',
    icon: Radio,
  },
  rest: { label: 'REST', description: 'One-shot HTTP fetch — no live updates.', icon: Globe },
  mock: { label: 'Mock', description: 'In-memory dummy stream — for dev/tests.', icon: TestTube2 },
  'mock-ssrm': {
    label: 'Mock SSRM',
    description: 'Mock feed with server-side row model (filter/sort/group in the SharedWorker).',
    icon: TestTube2,
  },
  appdata: { label: 'AppData', description: 'Key/value store referenced by other providers via {{name.key}}.', icon: Database },
};

const SUPPORTED_TYPES: ProviderType[] = ['stomp', 'stomp-ssrm', 'rest', 'mock', 'mock-ssrm', 'appdata'];

export interface DataProviderEditorProps {
  userId: string;
  /** Optional id to focus on open (popout receives via query string). */
  initialProviderId?: string | null;
  /** Optional close callback (popout window close). */
  onClose?: () => void;
}

export function DataProviderEditor({ userId, initialProviderId = null, onClose }: DataProviderEditorProps) {
  const { configStore } = useDataServices();
  // Editor sidebar lists EVERY kind of provider — including AppData
  // rows that the live-stream picker filters out. The user's mental
  // model is that anything they create here should be visible here
  // for editing later.
  const list = useDataProvidersList({ includeAppData: true });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialProviderId);
  const [creating, setCreating] = useState<DataProviderConfig | null>(null);
  const [draftSeq, setDraftSeq] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<DataProviderConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Resolve which row to edit. `creating` (an in-memory draft) wins
  // until saved; otherwise look up the selected id in the list.
  const selected = useMemo<DataProviderConfig | null>(() => {
    if (creating) return creating;
    if (!selectedId) return null;
    return list.configs.find((c) => c.providerId === selectedId) ?? null;
  }, [creating, selectedId, list.configs]);

  // When the popout opens with initialProviderId, snap selection
  // once the list resolves.
  useEffect(() => {
    if (initialProviderId && !selectedId && list.configs.some((c) => c.providerId === initialProviderId)) {
      setSelectedId(initialProviderId);
    }
  }, [initialProviderId, selectedId, list.configs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return list.configs;
    return list.configs.filter((c) => providerMatchesSearch(c, search));
  }, [list.configs, search]);

  // Unsaved create/clone drafts live only in `creating` until the form
  // saves — but the sidebar must show them immediately so clone feels
  // like a new list row (same as Workspace Setup component clone).
  const sidebarConfigs = useMemo(
    () => buildProviderSidebarConfigs(filtered, creating, draftSeq, search),
    [creating, draftSeq, filtered, search],
  );

  const activeListId = creating ? toDraftListId(draftSeq) : selectedId;

  const startCreate = (type: ProviderType) => {
    const fresh: DataProviderConfig = {
      providerId: undefined,
      name: 'untitled',
      providerType: type,
      config: getDefaultProviderConfig(type) as TransportConfig,
      userId,
      public: false,
    };
    setCreating(fresh);
    setSelectedId(null);
    setDraftSeq((n) => n + 1);
  };

  const startClone = (source: DataProviderConfig) => {
    setCreating(cloneProviderConfig(source, userId));
    setSelectedId(null);
    setDraftSeq((n) => n + 1);
  };

  // Import a config from a JSON file as a brand-new persisted provider.
  // The imported config has no identity (providerId/userId stripped on
  // export), so `save` mints a fresh providerId — a new instance owned by
  // the current user (or 'system' when public, matching the editor's own
  // save rule). The new row is then selected and opened for editing.
  const onImportFile = async (file: File) => {
    let portable: PortableProviderConfig;
    try {
      portable = parseProviderConfigImport(await file.text());
    } catch (err) {
      window.alert(`Could not import provider: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Imported JSON is fully untrusted — parse checks only the envelope.
    const validation = validateProviderConfig(portable.config);
    if (!validation.isValid) {
      window.alert(`Could not import provider: ${validation.errors.join('; ')}`);
      return;
    }
    try {
      const draft: DataProviderConfig = {
        ...portable,
        providerId: undefined,
        isDefault: false,
        userId: portable.public ? 'system' : userId,
      };
      const saved = await configStore.save(draft, userId);
      setCreating(null);
      setSelectedId(saved.providerId ?? null);
      list.refresh();
    } catch (err) {
      window.alert(`Could not import provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const onSaved = (saved: DataProviderConfig) => {
    setCreating(null);
    setSelectedId(saved.providerId ?? null);
    list.refresh();
  };

  const onFormCancel = () => {
    setCreating(null);
    setSelectedId(null);
    onClose?.();
  };

  const onDeleteRequest = (cfg: DataProviderConfig) => {
    setDeleteError(null);
    setConfirmDelete(cfg);
  };

  const onDelete = async (cfg: DataProviderConfig) => {
    if (!cfg.providerId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await configStore.remove(cfg.providerId);
      setConfirmDelete(null);
      if (selectedId === cfg.providerId) setSelectedId(null);
      list.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <Sidebar
        configs={sidebarConfigs}
        loading={list.loading}
        error={list.error}
        search={search}
        onSearchChange={setSearch}
        selectedId={activeListId}
        onSelect={(id) => {
          if (isDraftListId(id)) return;
          setCreating(null);
          setSelectedId(id);
        }}
        onNew={startCreate}
        onClone={startClone}
        onImportFile={onImportFile}
        onDeleteRequest={onDeleteRequest}
      />

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {selected ? (
          <EditorForm
            key={creating ? `draft-${draftSeq}` : (selectedId ?? 'empty')}
            initial={selected}
            userId={userId}
            onCancel={onFormCancel}
            onSaved={onSaved}
            onClone={
              !creating && selected.providerId
                ? () => startClone(selected)
                : undefined
            }
          />
        ) : (
          <EmptyRight onNew={startCreate} />
        )}
      </main>

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setConfirmDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent
          overlayClassName="z-[12100]"
          className="z-[12100]"
          data-testid="provider-delete-confirm"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} will be removed. Subscribers in other windows will fail
              to re-attach until a replacement is configured. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive" data-testid="provider-delete-error">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting || !confirmDelete?.providerId}
              data-testid="provider-delete-confirm-btn"
              onClick={() => confirmDelete && void onDelete(confirmDelete)}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sidebar — list of saved providers + "+ New" picker ──────────

function Sidebar({
  configs, loading, error, search, onSearchChange, selectedId, onSelect, onNew, onClone, onImportFile, onDeleteRequest,
}: {
  configs: readonly DataProviderConfig[];
  loading: boolean;
  error?: string;
  search: string;
  onSearchChange(s: string): void;
  selectedId: string | null;
  onSelect(id: string): void;
  onNew(type: ProviderType): void;
  onClone(cfg: DataProviderConfig): void;
  onImportFile(file: File): void;
  onDeleteRequest(cfg: DataProviderConfig): void;
}) {
  return (
    <aside className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col min-h-0">
      <div className="px-3 py-3 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Providers</h2>
          <div className="flex items-center gap-1.5">
            <ImportButton onImportFile={onImportFile} />
            <NewProviderPicker onPick={onNew} />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <ul className="p-2 space-y-1">
          {loading && <li className="text-xs text-muted-foreground px-2 py-3">Loading…</li>}
          {error && <li className="text-xs text-destructive px-2 py-3">{error}</li>}
          {!loading && configs.length === 0 && (
            <li className="text-xs text-muted-foreground px-2 py-3">No providers yet.</li>
          )}
          {configs.map((c) => (
            <SidebarRow
              key={c.providerId}
              cfg={c}
              selected={selectedId === c.providerId}
              isDraft={isDraftListId(c.providerId)}
              onSelect={() => c.providerId && onSelect(c.providerId)}
              onClone={() => onClone(c)}
              onDelete={() => onDeleteRequest(c)}
            />
          ))}
        </ul>
      </ScrollArea>
    </aside>
  );
}

function SidebarRow({
  cfg, selected, isDraft, onSelect, onClone, onDelete,
}: {
  cfg: DataProviderConfig;
  selected: boolean;
  isDraft?: boolean;
  onSelect(): void;
  onClone(): void;
  onDelete(): void;
}) {
  const meta = PROVIDER_TYPE_META[cfg.providerType] ?? PROVIDER_TYPE_META.mock;
  const Icon = meta.icon;
  return (
    <li
      role="button"
      tabIndex={0}
      data-selected={selected ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
      className={[
        'group rounded-md px-2 py-1.5 cursor-pointer flex items-center gap-2 text-xs',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      ].join(' ')}
    >
      <Icon className={`h-3.5 w-3.5 ${selected ? 'text-accent-foreground' : 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{cfg.name}</div>
        <div className={`text-[10px] flex items-center gap-1.5 ${selected ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
          <span>{meta.label}</span>
          {isDraft && (
            <Badge
              variant="outline"
              className={`h-3.5 px-1 text-[9px] ${selected ? 'border-accent-foreground/40 text-accent-foreground' : ''}`}
            >
              Unsaved
            </Badge>
          )}
          {cfg.public && (
            <Badge
              variant="outline"
              className={`h-3.5 px-1 text-[9px] ${selected ? 'border-accent-foreground/40 text-accent-foreground' : ''}`}
            >
              Public
            </Badge>
          )}
        </div>
      </div>
      {!isDraft && (
      <Button
        size="icon"
        variant="ghost"
        className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 ${
          selected
            ? 'text-accent-foreground/80 hover:text-accent-foreground hover:bg-accent-foreground/10'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={(e) => { e.stopPropagation(); onClone(); }}
        title="Duplicate"
      >
        <Copy className="h-3 w-3" />
      </Button>
      )}
      {!isDraft && (
      <Button
        size="icon"
        variant="ghost"
        className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 hover:text-destructive ${
          selected ? 'text-accent-foreground/80 hover:bg-accent-foreground/10' : 'text-muted-foreground'
        }`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
      )}
    </li>
  );
}

// Hidden file input + button. Resets `value` after each pick so the
// same file can be re-imported back-to-back (the change event won't
// fire for an identical value otherwise).
function ImportButton({ onImportFile }: { onImportFile(file: File): void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="provider-import-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => ref.current?.click()}
        title="Import a provider from an exported JSON file"
        data-testid="provider-import-btn"
      >
        <Upload className="h-3 w-3 mr-1" /> Import
      </Button>
    </>
  );
}

function NewProviderPicker({ onPick }: { onPick(type: ProviderType): void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ProviderType>('stomp');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" /> New</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Provider</DialogTitle>
          <DialogDescription>Pick a transport. You can change details after.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ProviderType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-sm">
                    {PROVIDER_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{PROVIDER_TYPE_META[type].description}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { setOpen(false); onPick(type); }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyRight({ onNew }: { onNew(type: ProviderType): void }) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-60" />
        <h2 className="text-base font-semibold mb-1">No provider selected</h2>
        <p className="text-xs text-muted-foreground mb-5">
          Pick a provider on the left, or create a new one to get started.
        </p>
        <div className="flex justify-center">
          <Button size="sm" onClick={() => onNew('stomp')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New STOMP Provider
          </Button>
        </div>
      </div>
    </div>
  );
}
