"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY } from "@wellsfargo-starui/types";
import { subscribeThemeBroadcast } from "@wellsfargo-starui/openfin/host";
import { Button } from "@wellsfargo-starui/react";
import { DynamicIcon as Icon } from "./icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { useConfigBrowser } from "./hooks/useConfigBrowser";
import { TableSidebar } from "./components/TableSidebar";
import { Toolbar } from "./components/Toolbar";
import { DataGrid } from "./components/DataGrid";
import { RowDrawer } from "./components/RowDrawer";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import { DeployExportPreviewDialog } from "./components/DeployExportPreviewDialog";
import { DeleteAllDialog } from "./components/DeleteAllDialog";
import { ResetToSeedDialog } from "./components/ResetToSeedDialog";
import { injectEditorStyles } from "./editorStyles";
import type { ImportMode, ImportPreview } from "./hooks/useConfigBrowser";
import type { DeployExportResult } from "@wellsfargo-starui/core/host/config";

// ─── Main Component ──────────────────────────────────────────────────

export function ConfigBrowserPanel() {
  const {
    hostEnv,
    restUrl,
    selected,
    setSelected,
    rows,
    counts,
    isLoading,
    refresh,
    saveRow,
    deleteRow,
    previewImport,
    importRows,
    deleteAllRows,
    exportAll,
    exportDeploy,
    seedConfigUrl,
    resetToSeed,
  } = useConfigBrowser();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [deployExportPreview, setDeployExportPreview] = useState<DeployExportResult | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [resetToSeedOpen, setResetToSeedOpen] = useState(false);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [quickFilter, setQuickFilter] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"edit" | "create">("edit");
  const [drawerRow, setDrawerRow] = useState<any | null>(null);

  useEffect(() => { injectEditorStyles(); }, []);

  // Sync theme with the dock toggle. This window mounts outside the
  // StarGridApp/OpenFinRuntime shell, so it subscribes directly — on BOTH
  // transports the dock fans out on:
  //   • IAB `theme-changed` with a wildcard sender uuid (`{ uuid: "*" }`) —
  //     the dock publishes from the platform provider, whose uuid can differ
  //     from this window's own; the wildcard avoids that mismatch.
  //   • same-origin `storage` events on the canonical `starui:theme` key,
  //     which the dock writes synchronously on every toggle.
  // The initial value is seeded from that same persisted key (rather than the
  // hang-prone `platform.Theme.getSelectedScheme()`).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch { /* storage unavailable */ }

    // subscribeThemeBroadcast covers both transports (wildcard-uuid IAB
    // `theme-changed` + same-origin `storage` events) and both payload
    // shapes — the same seam OpenFinRuntime and the tool windows use.
    return subscribeThemeBroadcast((next) => setTheme(next));
  }, []);

  // Apply [data-theme] so fi-dark / fi-light CSS vars re-resolve.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-ag-theme-mode", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const openEdit = (row: any) => {
    setDrawerMode("edit");
    setDrawerRow(row);
    setDrawerOpen(true);
  };

  const openCreate = () => {
    // Pre-fill appId for scopable tables so the new row lands in-scope
    const templateRow: Record<string, any> = rows[0] ? { ...rows[0] } : {};
    for (const k of Object.keys(templateRow)) templateRow[k] = "";
    if (selected.scopable && hostEnv.appId) templateRow["appId"] = hostEnv.appId;
    const now = new Date().toISOString();
    if ("creationTime" in templateRow) templateRow["creationTime"] = now;
    if ("updatedTime" in templateRow) templateRow["updatedTime"] = now;
    setDrawerMode("create");
    setDrawerRow(templateRow);
    setDrawerOpen(true);
  };

  const handleExport = () => {
    const json = JSON.stringify(rows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.key}-${hostEnv.appId || "all"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJsonBundle = (bundle: unknown, filename: string) => {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = async () => {
    const bundle = await exportAll();
    downloadJsonBundle(bundle, `config-bundle-${hostEnv.appId || "all"}.json`);
  };

  const handleExportDeployClick = async () => {
    const result = await exportDeploy();
    setDeployExportPreview(result);
  };

  const handleConfirmDeployExport = () => {
    if (!deployExportPreview) return;
    downloadJsonBundle(deployExportPreview.bundle, 'seed.json');
    setDeployExportPreview(null);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Reset the input value immediately so picking the same file twice
    // in a row still fires onChange the second time.
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert(
          "Import failed: expected a JSON array of rows (the same shape produced by Export JSON). " +
            "Got " + (parsed === null ? "null" : typeof parsed) + ".",
        );
        return;
      }
      // Hand off to the preview dialog — the actual save happens in
      // handleConfirmImport when the user picks a mode.
      setImportPreview(previewImport(parsed));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Import failed: " + msg);
    }
  };

  const handleConfirmImport = async (mode: ImportMode) => {
    if (!importPreview) return;
    const rowsToImport = importPreview.rows;
    setImportPreview(null);
    const result = await importRows(rowsToImport, mode);
    const summary =
      `Imported ${result.imported} row${result.imported === 1 ? "" : "s"} into ${selected.label}.` +
      (result.skipped > 0 ? `\nSkipped ${result.skipped} existing.` : "") +
      (result.failed > 0 ? `\nFailed ${result.failed}:\n` + result.errors.slice(0, 10).join("\n") : "");
    alert(summary);
  };

  const handleConfirmDeleteAll = async () => {
    setDeleteAllOpen(false);
    const result = await deleteAllRows();
    const summary =
      `Deleted ${result.deleted} row${result.deleted === 1 ? "" : "s"} from ${selected.label}.` +
      (result.failed > 0 ? `\nFailed ${result.failed}:\n` + result.errors.slice(0, 10).join("\n") : "");
    alert(summary);
  };

  const handleConfirmResetToSeed = async () => {
    setResetToSeedOpen(false);
    try {
      const result = await resetToSeed();
      const { counts } = result;
      alert(
        `Reset complete — re-seeded from ${result.seedUrl}:\n` +
          `${counts.appConfig} app configs, ${counts.appRegistry} app registry, ` +
          `${counts.userProfiles} user profiles, ${counts.roles} roles, ` +
          `${counts.permissions} permissions.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Reset to seed failed — your data was left untouched.\n\n${msg}`);
    }
  };

  return (
    <div
      data-dock-editor
      data-theme={theme}
      className="fixed inset-0 flex flex-col bg-[var(--de-bg-deep)] overflow-hidden font-[var(--de-font)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--de-border)] bg-[var(--de-bg)]">
        <Icon
          icon="lucide:database"
          className="w-[18px] h-[18px] text-[var(--de-accent)]"
        />
        <span className="text-[14px] font-semibold text-[var(--de-text)]">
          Config Browser
        </span>

        <span className="text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)] border border-[var(--de-border)]">
          appId: {hostEnv.appId || "—"}
        </span>

        {restUrl ? (
          <span
            title={`Writes mirror to ${restUrl}. Reads still come from local Dexie.`}
            className="inline-flex items-center gap-1.5 text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_12%,var(--de-bg-surface))] text-[var(--de-success,var(--ds-accent-positive))] border border-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_35%,var(--de-border))]"
          >
            <Icon icon="lucide:cloud" className="w-3 h-3" />
            <span>connected · {restUrl}</span>
          </span>
        ) : (
          <span
            title="ConfigManager is in local-only mode (no restUrl) — Dexie only."
            className="inline-flex items-center gap-1.5 text-[10px] font-[var(--de-mono)] px-2 py-[3px] rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)] border border-[var(--de-border)]"
          >
            <Icon icon="lucide:cloud-off" className="w-3 h-3" />
            <span>local only</span>
          </span>
        )}

      </div>

      {/* Body: sidebar + main */}
      <div className="flex-1 min-h-0 flex">
        <TableSidebar
          selected={selected.key}
          counts={counts}
          onSelect={setSelected}
        />

        <div className="flex-1 min-w-0 flex flex-col bg-[var(--de-bg-deep)] relative">
          <Toolbar
            table={selected}
            rowCount={rows.length}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            onRefresh={refresh}
            onNew={openCreate}
            onExport={handleExport}
            onExportAll={handleExportAll}
            onExportDeploy={handleExportDeployClick}
            onImport={handleImportClick}
            onDeleteAll={() => setDeleteAllOpen(true)}
            onResetToSeed={() => setResetToSeedOpen(true)}
            canResetToSeed={!!seedConfigUrl}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <div className="flex-1 min-h-0 flex flex-col pt-2 px-3 pb-3">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--de-text-tertiary)]">
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <Icon
                  icon="lucide:inbox"
                  className="w-10 h-10 text-[var(--de-text-ghost)]"
                />
                <div className="text-[13px] text-[var(--de-text-tertiary)]">
                  No rows in {selected.label}
                  {selected.scopable && hostEnv.appId ? ` for ${hostEnv.appId}` : ""}
                </div>
                <Button
                  type="button"
                  onClick={openCreate}
                  className="rounded-[var(--de-radius-sm)] border-none bg-[var(--de-accent)] px-4 py-2 text-xs font-semibold text-[var(--de-accent-foreground)] hover:bg-[var(--de-accent)]"
                >
                  Add first row
                </Button>
              </div>
            ) : (
              <DataGrid
                rows={rows}
                quickFilter={quickFilter}
                primaryKey={selected.primaryKey}
                onRowClick={openEdit}
              />
            )}
          </div>

          {/* Right-docked JSON editor — anchors to the main pane so it
              doesn't cover the header, footer, or table sidebar. */}
          <RowDrawer
            open={drawerOpen}
            mode={drawerMode}
            initialRow={drawerRow}
            primaryKey={selected.primaryKey}
            onClose={() => setDrawerOpen(false)}
            onSave={saveRow}
            onDelete={deleteRow}
          />
        </div>
      </div>

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          tableLabel={selected.label}
          primaryKey={selected.primaryKey}
          onCancel={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {deployExportPreview && (
        <DeployExportPreviewDialog
          result={deployExportPreview}
          appId={hostEnv.appId}
          onCancel={() => setDeployExportPreview(null)}
          onConfirm={handleConfirmDeployExport}
        />
      )}

      {deleteAllOpen && (
        <DeleteAllDialog
          tableLabel={selected.label}
          rowCount={rows.length}
          scope={selected.scopable && hostEnv.appId ? `appId = ${hostEnv.appId}` : null}
          onCancel={() => setDeleteAllOpen(false)}
          onDownloadBackup={handleExport}
          onConfirm={handleConfirmDeleteAll}
        />
      )}

      {resetToSeedOpen && seedConfigUrl && (
        <ResetToSeedDialog
          seedUrl={seedConfigUrl}
          onCancel={() => setResetToSeedOpen(false)}
          onDownloadBackup={handleExportAll}
          onConfirm={handleConfirmResetToSeed}
        />
      )}

      {/* Footer */}
      <div className="px-5 py-2 border-t border-[var(--de-border)] bg-[var(--de-bg)] flex items-center gap-3 text-[10px] text-[var(--de-text-tertiary)] font-[var(--de-mono)]">
        <span>{rows.length} rows</span>
        <span>·</span>
        <span>dexie · marketsui-config</span>
        <span>·</span>
        <span>{restUrl ? `REST → ${restUrl}` : "local only"}</span>
        <div className="flex-1" />
        <span>{selected.description}</span>
      </div>

    </div>
  );
}
