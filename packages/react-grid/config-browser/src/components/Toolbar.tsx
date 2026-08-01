import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Input } from "@wellsfargo-starui/react";
import type { TableMeta } from "../types";
import { EditorButton } from "./EditorButton";

interface ToolbarProps {
  table: TableMeta;
  rowCount: number;
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  onRefresh: () => void;
  onNew: () => void;
  onExport: () => void;
  onExportAll: () => void;
  onExportDeploy: () => void;
  onImport: () => void;
  onDeleteAll: () => void;
  onResetToSeed: () => void;
  /** False when no `seedConfigUrl` is configured — disables Reset to seed. */
  canResetToSeed: boolean;
}

export function Toolbar({
  table,
  rowCount,
  quickFilter,
  onQuickFilterChange,
  onRefresh,
  onNew,
  onExport,
  onExportAll,
  onExportDeploy,
  onImport,
  onDeleteAll,
  onResetToSeed,
  canResetToSeed,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--de-border)] bg-[var(--de-bg)] px-4 py-2.5">
      <div className="flex flex-col gap-0.5">
        <div className="text-[13px] font-semibold text-[var(--de-text)]">
          {table.label}
        </div>
        <div className="text-[11px] text-[var(--de-text-tertiary)]">
          {rowCount} {rowCount === 1 ? "row" : "rows"} · pk {table.primaryKey}
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative w-60">
        <Icon
          icon="lucide:search"
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--de-text-tertiary)]"
        />
        <Input
          value={quickFilter}
          onChange={(e) => onQuickFilterChange(e.target.value)}
          placeholder="Search rows…"
          className="h-[30px] pl-7 text-[12px] bg-[var(--de-bg-surface)] border-[var(--de-border)] text-[var(--de-text)]"
        />
      </div>

      <EditorButton onClick={onRefresh} title="Refresh" icon="lucide:refresh-cw" />
      <EditorButton onClick={onImport} title="Import JSON (matches Export format)" icon="lucide:upload" />
      <EditorButton onClick={onExport} title="Export JSON (this table only)" icon="lucide:download" />
      <EditorButton
        onClick={onExportDeploy}
        title="Export for deploy — scoped seed bundle with validation (workspaces + referenced instances only)"
        icon="lucide:rocket"
      />
      <EditorButton
        onClick={onExportAll}
        title="Export ALL (raw) — full Dexie dump for debugging; may include orphan instance rows"
        icon="lucide:package"
      />
      <EditorButton
        onClick={onResetToSeed}
        title={
          canResetToSeed
            ? "Reset ALL config to seed.json (requires backup first)"
            : "Reset to seed unavailable — no seed file is configured"
        }
        icon="lucide:database-backup"
        disabled={!canResetToSeed}
        variant="danger"
      />
      <EditorButton
        onClick={onDeleteAll}
        title="Delete all rows in this view (requires backup)"
        icon="lucide:trash-2"
        disabled={rowCount === 0}
        variant="danger"
      />
      <EditorButton onClick={onNew} title="New row" icon="lucide:plus" variant="primary">
        New
      </EditorButton>
    </div>
  );
}
