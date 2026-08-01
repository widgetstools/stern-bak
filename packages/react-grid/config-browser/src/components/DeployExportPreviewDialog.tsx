/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DeployExportPreviewDialog — validation summary before downloading a
 * scoped deploy bundle (seed-ready, workspace-referenced rows only).
 */

import { useState } from "react";
import { Button, Checkbox } from "@wellsfargo-starui/react";
import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type { DeployExportResult, DeployExportWarning } from "@wellsfargo-starui/core/host/config";

interface DeployExportPreviewDialogProps {
  result: DeployExportResult;
  appId: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const SEVERITY_ORDER = ["error", "warn", "info"] as const;
const SEVERITY_LABEL: Record<string, string> = {
  error: "Errors",
  warn: "Warnings",
  info: "Info",
};
const SEVERITY_ICON: Record<string, string> = {
  error: "lucide:octagon-alert",
  warn: "lucide:triangle-alert",
  info: "lucide:info",
};

export function DeployExportPreviewDialog({
  result,
  appId,
  onCancel,
  onConfirm,
}: DeployExportPreviewDialogProps) {
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const { stats, warnings, hasErrors } = result;
  const errors = warnings.filter((w) => w.severity === "error");
  const warns = warnings.filter((w) => w.severity === "warn");
  const hasIssues = hasErrors || warns.length > 0;
  const canDownload = !hasIssues || acknowledgeWarnings;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deploy-export-title"
      className="fixed inset-0 bg-background/55 flex items-center justify-center z-[1000] font-[var(--de-font)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] max-h-[90vh] flex flex-col bg-[var(--de-bg)] border border-[var(--de-border)] rounded-[var(--de-radius-md,2px)] shadow-[var(--ds-elevation-overlay)] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-[18px] py-[14px] border-b border-[var(--de-border)]">
          <Icon icon="lucide:rocket" className="h-4 w-4 text-[var(--de-accent)]" />
          <span id="deploy-export-title" className="text-[13px] font-semibold text-[var(--de-text)]">
            Export for deploy · {appId || "all apps"}
          </span>
        </div>

        <div className="px-[18px] py-4 overflow-auto flex-1">
          <p className="text-[12px] text-[var(--de-text-secondary)] leading-relaxed mb-4">
            Ship-with-app seed bundle — save as <code className="font-[var(--de-mono)]">public/seed.json</code>{' '}
            and commit with your build. On first launch the platform loads it automatically via{' '}
            <code className="font-[var(--de-mono)]">seedConfigUrl</code>. Every appConfig row is included;
            scope drift is normalized on export and again at startup.
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-[var(--de-mono)] mb-4">
            <Stat label="appConfig included" value={String(stats.appConfigIncluded)} />
            <Stat label="appConfig excluded" value={String(stats.appConfigExcluded)} />
            <Stat label="referenced instances" value={String(stats.referencedInstanceIds.length)} />
            <Stat label="total appConfig" value={String(stats.appConfigTotal)} />
          </div>

          {stats.referencedInstanceIds.length > 0 && (
            <div className="text-[10px] text-[var(--de-text-tertiary)] font-[var(--de-mono)] mb-4 break-all">
              instanceIds: {stats.referencedInstanceIds.join(", ")}
            </div>
          )}

          {warnings.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-[var(--de-success,var(--ds-accent-positive))]">
              <Icon icon="lucide:circle-check" className="h-4 w-4" />
              No issues detected — safe to download.
            </div>
          ) : (
            <WarningList warnings={warnings} />
          )}

          {hasIssues && (
            <label className="mt-4 flex items-start gap-2 text-[12px] text-[var(--de-text-secondary)] cursor-pointer">
              <Checkbox
                checked={acknowledgeWarnings}
                onCheckedChange={(v) => setAcknowledgeWarnings(v === true)}
                className="mt-0.5"
              />
              <span>
                Download seed.json anyway — I understand {warnings.length} issue
                {warnings.length === 1 ? '' : 's'} below may cause empty grids or missing links at runtime.
              </span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 px-[18px] py-3 border-t border-[var(--de-border)] bg-[var(--de-bg-surface)]">
          <Button type="button" variant="outline" onClick={onCancel} className="text-xs h-8">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canDownload}
            className="text-xs h-8 bg-[var(--de-accent)] text-[var(--de-accent-foreground)] hover:bg-[var(--de-accent)] disabled:opacity-50"
          >
            Download seed.json
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-2 rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] border border-[var(--de-border)]">
      <div className="text-[var(--de-text-tertiary)]">{label}</div>
      <div className="text-[var(--de-text)] font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: DeployExportWarning[] }) {
  const grouped = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: warnings.filter((w) => w.severity === sev),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(({ severity, items }) => (
        <div key={severity}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--de-text-tertiary)] mb-1.5">
            <Icon icon={SEVERITY_ICON[severity]} className="h-3.5 w-3.5" />
            {SEVERITY_LABEL[severity]} ({items.length})
          </div>
          <ul className="flex flex-col gap-1.5 max-h-[200px] overflow-auto">
            {items.map((w, i) => (
              <li
                key={`${w.code}-${i}`}
                className="text-[11px] leading-snug px-2 py-1.5 rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] border border-[var(--de-border)] text-[var(--de-text-secondary)]"
              >
                <span className="font-[var(--de-mono)] text-[var(--de-text-tertiary)]">{w.code}</span>
                {w.configId ? (
                  <span className="text-[var(--de-text-ghost)]"> · {w.configId}</span>
                ) : null}
                <div className="mt-0.5 text-[var(--de-text)]">{w.message}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
