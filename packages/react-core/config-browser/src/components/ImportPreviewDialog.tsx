/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ImportPreviewDialog — confirms the user's intent before mutating the
 * database. Shown after parsing a JSON import file and computing a
 * preview (fresh vs. conflicting vs. invalid).
 *
 * The user picks a mode:
 *   - `skip-existing` (default) — only insert rows whose PK is new
 *   - `overwrite`               — upsert every valid row (overwrites collisions)
 *
 * Cancel closes the dialog without touching the database.
 */

import { useState } from "react";
import { Button, RadioGroup, RadioGroupItem } from "@wellsfargo-starui/ui";
import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type { ImportPreview, ImportMode } from "../hooks/useConfigBrowser";

interface ImportPreviewDialogProps {
  preview: ImportPreview;
  tableLabel: string;
  primaryKey: string;
  onCancel: () => void;
  onConfirm: (mode: ImportMode) => void;
}

export function ImportPreviewDialog({
  preview,
  tableLabel,
  primaryKey,
  onCancel,
  onConfirm,
}: ImportPreviewDialogProps) {
  const [mode, setMode] = useState<ImportMode>("skip-existing");

  const validCount = preview.fresh.length + preview.conflicts.length;
  const willImport =
    mode === "overwrite"
      ? validCount
      : preview.fresh.length;
  const willSkip = mode === "skip-existing" ? preview.conflicts.length : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-preview-title"
      className="fixed inset-0 bg-background/55 flex items-center justify-center z-[1000] font-[var(--de-font)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] max-h-[90vh] flex flex-col bg-[var(--de-bg)] border border-[var(--de-border)] rounded-[var(--de-radius-md,2px)] shadow-[var(--ds-elevation-overlay)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-[18px] py-[14px] border-b border-[var(--de-border)]">
          <Icon icon="lucide:upload" className="h-4 w-4 text-[var(--de-accent)]" />
          <span id="import-preview-title" className="text-[13px] font-semibold text-[var(--de-text)]">
            Import preview · {tableLabel}
          </span>
        </div>

        {/* Body */}
        <div className="px-[18px] py-4 overflow-auto flex-1">
          <SummaryGrid
            total={preview.rows.length}
            fresh={preview.fresh.length}
            conflicts={preview.conflicts.length}
            invalid={preview.invalid.length}
            primaryKey={primaryKey}
          />

          {/* Mode selector */}
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as ImportMode)}
            className="mt-[18px] flex flex-col gap-2"
          >
            <ModeRadio
              value="skip-existing"
              title="Skip existing rows"
              description={`Only insert ${preview.fresh.length} new row${preview.fresh.length === 1 ? "" : "s"}. Existing rows in the table are left untouched.`}
              disabled={preview.fresh.length === 0}
            />
            <ModeRadio
              value="overwrite"
              title="Overwrite existing rows"
              description={`Upsert all ${validCount} valid row${validCount === 1 ? "" : "s"}. ${preview.conflicts.length} existing row${preview.conflicts.length === 1 ? "" : "s"} will be replaced.`}
              disabled={validCount === 0}
              warning={preview.conflicts.length > 0}
            />
          </RadioGroup>

          {preview.invalid.length > 0 && (
            <div
              className="mt-[14px] px-3 py-2.5 bg-[var(--de-bg-surface)] border border-[var(--de-border)] rounded-[var(--de-radius-sm)] text-[11px] text-[var(--de-text-secondary)]"
            >
              <div className="font-semibold mb-1 text-[var(--de-text)]">
                {preview.invalid.length} invalid row{preview.invalid.length === 1 ? "" : "s"} (will be ignored)
              </div>
              <ul className="m-0 pl-[18px] font-[var(--de-mono)]">
                {preview.invalid.slice(0, 5).map((inv, i) => (
                  <li key={i}>{inv.reason}</li>
                ))}
                {preview.invalid.length > 5 && <li>… and {preview.invalid.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-[18px] py-3 border-t border-[var(--de-border)] bg-[var(--de-bg-surface)]"
        >
          <span className="text-[11px] text-[var(--de-text-tertiary)] font-[var(--de-mono)]">
            {willImport} import · {willSkip} skip · {preview.invalid.length} invalid
          </span>
          <div className="flex-1" />
          <DialogButton onClick={onCancel} title="Cancel">Cancel</DialogButton>
          <DialogButton
            onClick={() => onConfirm(mode)}
            title="Import"
            disabled={willImport === 0}
            primary
          >
            Import {willImport > 0 ? willImport : ""}
          </DialogButton>
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({
  total,
  fresh,
  conflicts,
  invalid,
  primaryKey,
}: {
  total: number;
  fresh: number;
  conflicts: number;
  invalid: number;
  primaryKey: string;
}) {
  return (
    <div>
      <div className="text-[12px] text-[var(--de-text-secondary)] mb-2.5">
        Parsed <strong className="text-[var(--de-text)]">{total}</strong> row
        {total === 1 ? "" : "s"}. Conflicts detected by primary key{" "}
        <code className="font-[var(--de-mono)] text-[var(--de-text)]">{primaryKey}</code>.
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatCell label="New" value={fresh} accent="var(--de-success, var(--ds-accent-positive))" />
        <StatCell label="Will overwrite" value={conflicts} accent="var(--ds-accent-warning)" />
        <StatCell label="Invalid" value={invalid} accent="var(--de-danger, var(--ds-accent-negative))" />
      </div>
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="px-3 py-2.5 bg-[var(--de-bg-surface)] border border-[var(--de-border)] rounded-[var(--de-radius-sm)]"
    >
      <div className="text-[18px] font-bold font-[var(--de-mono)]" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--de-text-tertiary)] uppercase tracking-[0.4px]">
        {label}
      </div>
    </div>
  );
}

function ModeRadio({
  value,
  title,
  description,
  disabled,
  warning,
}: {
  value: ImportMode;
  title: string;
  description: string;
  disabled?: boolean;
  warning?: boolean;
}) {
  return (
    <label
      className={[
        'flex gap-2.5 rounded-[var(--de-radius-sm)] border px-3 py-2.5 transition-[border-color] duration-100',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        'has-[[data-state=checked]]:border-[var(--de-accent)] has-[[data-state=checked]]:bg-[var(--de-bg-surface)]',
        'border-[var(--de-border)] bg-transparent',
      ].join(' ')}
    >
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-[var(--de-text)]">{title}</span>
          {warning && (
            <Icon
              icon="lucide:alert-triangle"
              style={{ width: 12, height: 12 }}
              className="text-[var(--ds-accent-warning)]"
            />
          )}
        </div>
        <div className="text-[11px] text-[var(--de-text-tertiary)] mt-0.5">{description}</div>
      </div>
    </label>
  );
}

function DialogButton({
  onClick,
  title,
  children,
  disabled,
  primary,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      variant={primary ? 'default' : 'outline'}
      size="sm"
      className="h-[30px] px-3.5 text-xs font-medium font-[var(--de-font)]"
    >
      {children}
    </Button>
  );
}
