/**
 * EditorForm — the four-tab provider editor body.
 *
 * Tabs:
 *   1. Connection   — per-transport fields + Test Connection
 *   2. Fields       — Infer + checkbox tree → ColumnDefinition[]
 *   3. Columns      — review + edit selected columns
 *   4. Behaviour    — per-transport behaviour knobs
 *   5. Diagnostics  — only when editing an already-saved provider
 *
 * Owns:
 *   - the working DataProviderConfig (cfg + name + description + public)
 *   - probe state (Test + Infer share one hook)
 *   - save state (saving / saved / error) and the relabel from
 *     "Create" → "Update" once a providerId exists.
 *
 * Layout contract: the outer container has `overflow: hidden`. The
 * tab list never scrolls; only individual tab bodies own internal
 * scrolling where the content legitimately overflows.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Button, Input, Label, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '@wellsfargo-starui/react';
import { CheckCircle2, Columns3, Copy, Download, Loader2, X } from 'lucide-react';
import type { ColumnDefinition, DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types/shared';
import { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import { exportProviderConfig } from './providerConfigIo.js';
import { useProviderProbe } from './useProviderProbe.js';
import { ConnectionTab } from './tabs/ConnectionTab.js';
import { FieldsTab } from './tabs/FieldsTab.js';
import { ColumnsTab } from './tabs/ColumnsTab.js';
import { DiagnosticsTab } from './tabs/DiagnosticsTab.js';
import { BehaviourFields } from './transports/BehaviourFields.js';

const SAVING_PULSE_MS = 1200;

export interface EditorFormProps {
  /** Initial DataProviderConfig — `providerId` is null for "new". */
  initial: DataProviderConfig;
  /** Active user — drives row ownership for non-public saves. */
  userId: string;
  /** Called on cancel (e.g. close popout). */
  onCancel?: () => void;
  /** Called after a successful save. The form stays open and the saved
   *  config (now with a stable providerId) is passed back. */
  onSaved?: (saved: DataProviderConfig) => void;
  /** Duplicate the current saved provider into a new unsaved draft. */
  onClone?: () => void;
}

export function EditorForm({ initial, userId, onCancel, onSaved, onClone }: EditorFormProps) {
  const { configStore } = useDataServices();
  const [provider, setProvider] = useState<DataProviderConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset working state when the editor target changes (e.g. user
  // picks a different row in the list).
  useEffect(() => {
    setProvider(initial);
    setSavedAt(null);
    setSaveError(null);
  }, [initial.providerId]);

  // Hide the "Saved" pulse after a moment.
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), SAVING_PULSE_MS);
    return () => clearTimeout(t);
  }, [savedAt]);

  const probe = useProviderProbe(provider.config);

  // FieldsTab now BUFFERS its selection here instead of writing
  // straight into cfg. The user has to click "Update Columns" in the
  // footer to commit the draft into ColumnsTab — gives them room to
  // toggle individual fields (filtered or not) without churning the
  // committed column list.
  const [pendingFieldsCols, setPendingFieldsCols] = useState<ColumnDefinition[] | null>(null);

  const updateCfg = (patch: Partial<ProviderConfig>) => {
    setProvider((p) => ({ ...p, config: { ...p.config, ...patch } as ProviderConfig }));
  };

  // Direct column updates from ColumnsTab (rename, reorder, delete,
  // manual add) — no buffering for those.
  const updateColumns = (cols: ColumnDefinition[]) => {
    updateCfg({ columnDefinitions: cols } as unknown as Partial<ProviderConfig>);
  };

  /**
   * Commit the FieldsTab draft into the column list. Merge semantics
   * are union-by-`field`:
   *   - Every existing column is kept as-is (preserves user-edited
   *     header names, types, widths from the Columns tab).
   *   - Every field newly selected in FieldsTab that doesn't already
   *     have a column definition is appended.
   * No column is removed by this action — to drop columns, the user
   * works in the Columns tab directly.
   */
  const applyPendingFieldsCols = () => {
    if (!pendingFieldsCols) return;
    const existing = readColumns(provider.config);
    const existingByField = new Map(existing.map((c) => [c.field, c]));
    const merged = [...existing];
    for (const incoming of pendingFieldsCols) {
      if (!existingByField.has(incoming.field)) merged.push(incoming);
    }
    updateColumns(merged);
    setPendingFieldsCols(null);
  };

  /**
   * Detect whether the FieldsTab draft would actually change the
   * committed columns when applied. The button is disabled otherwise.
   */
  const hasPendingFieldsChanges = useMemo(() => {
    if (!pendingFieldsCols) return false;
    const existing = readColumns(provider.config);
    const existingFields = new Set(existing.map((c) => c.field));
    return pendingFieldsCols.some((c) => !existingFields.has(c.field));
  }, [pendingFieldsCols, provider.config]);

  /**
   * Persist the row-key configuration. Keep storage shape canonical:
   *   - 0 columns selected → omit the field (`undefined`)
   *   - 1 column          → store as a plain string (legacy shape)
   *   - 2+ columns        → store as an array (composite key)
   * Reads via `composeRowId` accept all three shapes, so this just
   * keeps the on-disk JSON tidy and stays back-compatible.
   */
  const updateKeyColumn = (next: readonly string[]) => {
    let value: string | string[] | undefined;
    if (next.length === 0) value = undefined;
    else if (next.length === 1) value = next[0];
    else value = [...next];
    updateCfg({ keyColumn: value } as unknown as Partial<ProviderConfig>);
  };

  const currentColumns = readColumns(provider.config);
  const currentKeyColumn = readKeyColumn(provider.config);

  const onSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Persist the inferred field tree alongside the cfg so the next
      // open of the editor sees the same FieldsTab tree without
      // re-probing.
      const next: DataProviderConfig = {
        ...provider,
        userId: provider.public ? 'system' : userId,
      };
      const saved = await configStore.save(next, userId);
      setProvider(saved);
      setSavedAt(Date.now());
      onSaved?.(saved);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const isExisting = Boolean(provider.providerId);
  const saveLabel = isExisting ? 'Update DataProvider' : 'Create DataProvider';

  // Pull selected column field-paths for FieldsTab. While the user is
  // editing in FieldsTab the draft buffer (`pendingFieldsCols`) is the
  // source of truth — sourcing this from `currentColumns` instead would
  // cause FieldsTab's `selected` state to revert on every parent
  // re-render (its sync-effect resets to the prop on every change),
  // making checkbox clicks appear to do nothing.
  const selectedColumnFields = useMemo<readonly string[]>(
    () => (pendingFieldsCols ?? currentColumns).map((c) => c.field),
    [pendingFieldsCols, currentColumns],
  );

  // Sample size lives outside the cfg so FieldsTab can change it
  // without dirtying the saved provider.
  const [sampleSize, setSampleSize] = useState(200);

  // AppData providers only show the connection tab (key/value pairs)
  const isAppData = provider.config.providerType === 'appdata';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Header
        provider={provider}
        onNameChange={(name) => setProvider((p) => ({ ...p, name }))}
        onDescriptionChange={(description) => setProvider((p) => ({ ...p, description }))}
        onPublicChange={(public_) => setProvider((p) => ({ ...p, public: public_ }))}
      />

      {isAppData ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ConnectionTab cfg={provider.config} onCfgChange={updateCfg} probe={probe} />
        </div>
      ) : (
        <Tabs defaultValue="connection" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="h-9 mx-4 mt-3 flex-shrink-0 self-start">
            <TabsTrigger value="connection" className="text-xs">Connection</TabsTrigger>
            <TabsTrigger value="fields" className="text-xs">Fields</TabsTrigger>
            <TabsTrigger value="columns" className="text-xs">Columns</TabsTrigger>
            <TabsTrigger value="behaviour" className="text-xs">Behaviour</TabsTrigger>
            {isExisting && <TabsTrigger value="diagnostics" className="text-xs">Diagnostics</TabsTrigger>}
          </TabsList>

          <TabsContent value="connection" className="flex-1 min-h-0 overflow-hidden m-0 mt-3">
            <ConnectionTab cfg={provider.config} onCfgChange={updateCfg} probe={probe} />
          </TabsContent>

          <TabsContent value="fields" className="flex-1 min-h-0 overflow-hidden m-0 mt-3">
            <FieldsTab
              cfg={provider.config}
              inferredFields={probe.inferredFields}
              inferenceSummary={probe.inferenceSummary}
              inferring={probe.inferring}
              inferenceError={probe.inferenceError}
              sampleSize={sampleSize}
              onSampleSizeChange={setSampleSize}
              onInfer={() => probe.infer({ sampleSize })}
              onColumnsChange={setPendingFieldsCols}
              selectedColumnFields={selectedColumnFields}
            />
          </TabsContent>

          <TabsContent value="columns" className="flex-1 min-h-0 overflow-hidden m-0 mt-3">
            <ColumnsTab
              columns={currentColumns}
              onChange={updateColumns}
              keyColumn={currentKeyColumn}
              onKeyColumnChange={updateKeyColumn}
            />
          </TabsContent>

          <TabsContent value="behaviour" className="flex-1 min-h-0 overflow-auto scrollbar-thin m-0 mt-3 p-4">
            <BehaviourFields cfg={provider.config} onChange={updateCfg} />
          </TabsContent>

          {isExisting && (
            <TabsContent value="diagnostics" className="flex-1 min-h-0 overflow-hidden m-0 mt-3">
              <DiagnosticsTab providerId={provider.providerId ?? null} cfg={provider.config} />
            </TabsContent>
          )}
        </Tabs>
      )}

      <Footer
        saveLabel={saveLabel}
        saving={saving}
        savedAt={savedAt}
        saveError={saveError}
        onSave={onSave}
        onCancel={onCancel}
        onClone={onClone}
        onExport={() => exportProviderConfig(provider)}
        onUpdateColumns={isAppData ? undefined : applyPendingFieldsCols}
        canUpdateColumns={hasPendingFieldsChanges}
      />
    </div>
  );
}

// ─── Header — name / description / public ─────────────────────────

function Header({
  provider, onNameChange, onDescriptionChange, onPublicChange,
}: {
  provider: DataProviderConfig;
  onNameChange(name: string): void;
  onDescriptionChange(description: string): void;
  onPublicChange(public_: boolean): void;
}) {
  return (
    <header className="px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0">
      <div className="flex items-end gap-3">
        <div className="w-52 shrink-0 space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Name *</Label>
          <Input
            className="h-8 text-sm"
            value={provider.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="positions-live"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">Description</Label>
          <Textarea
            className="text-xs min-h-0 scrollbar-thin"
            rows={1}
            value={provider.description ?? ''}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="What this provider streams (optional)"
          />
        </div>
        <div className="flex items-center gap-2 pb-1.5 shrink-0">
          <Switch
            id="public-toggle"
            checked={Boolean(provider.public)}
            onCheckedChange={onPublicChange}
          />
          <Label htmlFor="public-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer">
            Public
          </Label>
        </div>
      </div>
    </header>
  );
}

// ─── Footer — save controls ───────────────────────────────────────

// Stomp + Rest carry columnDefinitions on the cfg. The other transports
// (websocket / socketio / mock / appdata) don't — but the editor still
// needs a uniform read path. Cast through `unknown` and shape-check.
function readColumns(cfg: ProviderConfig): ColumnDefinition[] {
  const maybe = (cfg as unknown as { columnDefinitions?: ColumnDefinition[] }).columnDefinitions;
  return Array.isArray(maybe) ? maybe : [];
}

// Same uniform-read pattern for the row-key configuration. Stomp + Rest
// expose `keyColumn` (single string OR array of column names); other
// transports don't carry it.
function readKeyColumn(cfg: ProviderConfig): string | readonly string[] | undefined {
  const maybe = (cfg as unknown as { keyColumn?: string | readonly string[] }).keyColumn;
  if (typeof maybe === 'string') return maybe;
  return Array.isArray(maybe) ? maybe : undefined;
}

function Footer({
  saveLabel, saving, savedAt, saveError, onSave, onCancel, onClone, onExport,
  onUpdateColumns, canUpdateColumns,
}: {
  saveLabel: string;
  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
  onSave(): void;
  onCancel?(): void;
  onClone?(): void;
  /** Download the current working config (including unsaved edits) as JSON. */
  onExport?(): void;
  /** Apply the FieldsTab draft to the column list. Omitted for
   *  AppData providers (no fields tab). */
  onUpdateColumns?(): void;
  /** Disables the Update Columns button when there's nothing to apply. */
  canUpdateColumns?: boolean;
}) {
  return (
    <footer className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between flex-shrink-0">
      <div className="text-xs">
        {saveError ? (
          <span className="text-destructive inline-flex items-center gap-1.5">
            <X className="h-3.5 w-3.5" /> {saveError}
          </span>
        ) : savedAt ? (
          <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        ) : (
          <span className="text-muted-foreground">Unsaved changes are kept locally until you click {saveLabel}.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 text-xs">Cancel</Button>
        )}
        {onExport && (
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            className="h-8 text-xs"
            title="Download this provider config (including unsaved edits) as a JSON file"
            data-testid="provider-export-btn"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        )}
        {onClone && (
          <Button
            size="sm"
            variant="outline"
            onClick={onClone}
            className="h-8 text-xs"
            title="Copy this provider into a new draft you can edit and save separately"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Duplicate
          </Button>
        )}
        {onUpdateColumns && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUpdateColumns}
            disabled={!canUpdateColumns}
            className="h-8 text-xs"
            title={
              canUpdateColumns
                ? 'Merge the Fields-tab selection into the Columns tab (existing columns kept; new fields appended).'
                : 'No new fields selected in the Fields tab.'
            }
          >
            <Columns3 className="h-3.5 w-3.5 mr-1.5" />
            Update Columns
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving} className="h-8 text-xs min-w-[180px]">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </footer>
  );
}
