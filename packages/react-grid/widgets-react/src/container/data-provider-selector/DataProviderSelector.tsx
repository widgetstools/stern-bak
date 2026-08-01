/**
 * DataProviderSelector (v2) — pick a saved DataProvider to attach.
 *
 * Drops v1's React Query layer + dual-service shim. Reads providers
 * directly from `useDataProvidersList()` (which calls into the v2
 * `DataProviderConfigStore` → `ConfigManager`). The store is
 * dual-mode (IndexedDB / REST) so this picker doesn't have to know
 * which backend is live.
 *
 * Modes
 * -----
 *   • `dropdown` (default) — compact `<Select>` for embedding in a
 *     toolbar / settings row (used by `<ProviderToolbar>`).
 *   • `list` — vertical card list. Used inside the MarketsGrid
 *     customizer's Data section.
 *
 * Edit affordance
 * ---------------
 * The picker is read-only on click (selection only). Authoring goes
 * through `<DataProviderEditor>` — pass `onEdit` to wire up a popout
 * launcher next to the selected row. `onCreate` does the same for
 * the "+ New" button.
 */

import { useMemo } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge, Button, ScrollArea,
} from '@wellsfargo-starui/react';
import { Database, Loader2, Pencil, Plus, RefreshCw } from 'lucide-react';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/shared-types';
import { useDataProvidersList } from '@wellsfargo-starui/react/data/runtime';

const PUBLIC_USER_ID = 'system';
const NONE_VALUE = '__none__';

export interface DataProviderSelectorProps {
  /** Restrict to a transport. e.g. live slot = 'stomp', historical = 'rest'. */
  subtype?: ProviderConfig['providerType'];
  /** Selected providerId. `null` = nothing selected. */
  value: string | null;
  onChange(providerId: string | null): void;
  mode?: 'dropdown' | 'list';
  disabled?: boolean;
  /** Hide the "+ New" button. Default: shown when `onCreate` is set. */
  hideCreate?: boolean;
  onCreate?(): void;
  onEdit?(provider: DataProviderConfig): void;
  placeholder?: string;
  className?: string;
}

export function DataProviderSelector({
  subtype,
  value,
  onChange,
  mode = 'dropdown',
  disabled = false,
  hideCreate = false,
  onCreate,
  onEdit,
  placeholder = 'Select a data provider…',
  className,
}: DataProviderSelectorProps) {
  const list = useDataProvidersList(subtype ? { subtype } : {});

  // Sort: public first, then alpha. Keeps the list scannable when a
  // user has accumulated many private providers.
  const sorted = useMemo(() => {
    const copy = list.configs.slice();
    copy.sort((a, b) => {
      const aPublic = isPublic(a);
      const bPublic = isPublic(b);
      if (aPublic !== bPublic) return aPublic ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [list.configs]);

  const selected = useMemo(
    () => sorted.find((p) => p.providerId === value) ?? null,
    [sorted, value],
  );

  const showCreate = !hideCreate && Boolean(onCreate);

  if (mode === 'dropdown') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <Select
          value={value ?? NONE_VALUE}
          onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-sm flex-1 min-w-0">
            <SelectValue placeholder={placeholder}>
              {selected ? <SelectedDisplay provider={selected} /> : placeholder}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {list.loading && <ListMessage>Loading…</ListMessage>}
            {!list.loading && sorted.length === 0 && (
              <ListMessage>No {subtype ? `${subtype.toUpperCase()} ` : ''}providers found.</ListMessage>
            )}
            <SelectItem value={NONE_VALUE} className="text-muted-foreground">
              <span className="text-xs">— None —</span>
            </SelectItem>
            {sorted.map((p) => (
              <SelectItem key={p.providerId} value={p.providerId!}>
                <ProviderRow provider={p} compact />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && onEdit && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEdit(selected)}
            disabled={disabled}
            title="Edit selected provider"
            className="h-8 w-8 p-0 shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {showCreate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreate}
            disabled={disabled}
            className="h-8 shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        )}
      </div>
    );
  }

  // ─── list mode ────────────────────────────────────────────────
  return (
    <div className={`flex flex-col rounded-md border border-border bg-card ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span>
            {sorted.length} {subtype ? `${subtype.toUpperCase()} ` : ''}provider{sorted.length === 1 ? '' : 's'} visible
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={list.refresh}
            disabled={disabled || list.loading}
            className="h-7 w-7 p-0"
            title="Refresh"
          >
            {list.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          {showCreate && (
            <Button type="button" size="sm" variant="outline" onClick={onCreate} disabled={disabled} className="h-7">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="max-h-72">
        <div className="p-1">
          {list.loading && <ListMessage>Loading…</ListMessage>}
          {list.error && <ListMessage destructive>{list.error}</ListMessage>}
          {!list.loading && sorted.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No {subtype ? `${subtype.toUpperCase()} ` : ''}providers configured.
              {showCreate && (
                <div className="mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={onCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create your first
                  </Button>
                </div>
              )}
            </div>
          )}
          {sorted.map((p) => {
            const isSel = p.providerId === value;
            return (
              <button
                type="button"
                key={p.providerId}
                onClick={() => !disabled && p.providerId && onChange(p.providerId)}
                disabled={disabled}
                className={[
                  'w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm transition-colors',
                  isSel ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
                  disabled ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
                aria-pressed={isSel}
              >
                <ProviderRow provider={p} />
                {onEdit && isSel && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(p);
                      }
                    }}
                    className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────

function isPublic(p: DataProviderConfig): boolean {
  return p.userId === PUBLIC_USER_ID || p.public === true;
}

function ListMessage({ children, destructive }: { children: React.ReactNode; destructive?: boolean }) {
  return (
    <div className={[
      'px-3 py-2 text-xs flex items-center gap-2',
      destructive ? 'text-destructive' : 'text-muted-foreground',
    ].join(' ')}>
      {!destructive && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </div>
  );
}

function SelectedDisplay({ provider }: { provider: DataProviderConfig }) {
  return (
    <span className="inline-flex items-center gap-2 truncate">
      <span className="truncate">{provider.name}</span>
      <ScopeBadge provider={provider} />
    </span>
  );
}

function ProviderRow({ provider, compact }: { provider: DataProviderConfig; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 min-w-0 w-full">
      <span className="truncate flex-1 min-w-0">{provider.name}</span>
      <Badge variant="outline" className="text-[length:var(--ds-font-size-xs)] shrink-0 uppercase">{provider.providerType}</Badge>
      <ScopeBadge provider={provider} />
      {!compact && provider.description && (
        <span className="text-[length:var(--ds-font-size-sm)] text-muted-foreground truncate hidden md:inline">
          {provider.description}
        </span>
      )}
    </span>
  );
}

function ScopeBadge({ provider }: { provider: DataProviderConfig }) {
  const pub = isPublic(provider);
  return (
    <Badge
      variant={pub ? 'secondary' : 'outline'}
      className="text-[length:var(--ds-font-size-xs)] shrink-0"
      title={pub ? 'Public — visible to everyone in this app' : 'Private — visible to you only'}
    >
      {pub ? 'Public' : 'Private'}
    </Badge>
  );
}
