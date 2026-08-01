/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DeleteAllDialog — destructive confirmation modal for nuking every
 * row in the visible table. Three guard rails before the delete button
 * unlocks:
 *   1. The user MUST download a backup first (the same JSON the Export
 *      button produces — round-trips with Import).
 *   2. The user MUST type the table label exactly to acknowledge the
 *      target.
 *   3. Click + hold semantics are *not* used; we lean on points 1 + 2
 *      so the click itself is intentional.
 */

import { useState, type ReactNode } from "react";
import { Button, Input, cn } from "@wellsfargo-starui/ui";
import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { EditorButton } from "./EditorButton";

interface DeleteAllDialogProps {
  tableLabel: string;
  rowCount: number;
  scope: string | null;
  onCancel: () => void;
  onDownloadBackup: () => void;
  onConfirm: () => void;
}

export function DeleteAllDialog({
  tableLabel,
  rowCount,
  scope,
  onCancel,
  onDownloadBackup,
  onConfirm,
}: DeleteAllDialogProps) {
  const [backedUp, setBackedUp] = useState(false);
  const [typed, setTyped] = useState("");

  const typedMatches = typed.trim().toLowerCase() === tableLabel.toLowerCase();
  const canDelete = backedUp && typedMatches && rowCount > 0;

  const handleBackup = () => {
    onDownloadBackup();
    setBackedUp(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-all-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/55 font-[var(--de-font)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-[var(--de-radius-md,2px)] border border-[var(--de-danger,var(--ds-accent-negative))] bg-[var(--de-bg)] shadow-[var(--ds-elevation-overlay)]"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--de-border)] bg-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_8%,var(--de-bg))] px-[18px] py-[14px]">
          <Icon
            icon="lucide:alert-triangle"
            className="h-4 w-4 text-[var(--de-danger,var(--ds-accent-negative))]"
          />
          <span id="delete-all-title" className="text-[13px] font-semibold text-[var(--de-text)]">
            Delete all rows in {tableLabel}
          </span>
        </div>

        <div className="flex flex-col gap-[14px] px-[18px] py-4">
          <div className="text-[12px] leading-[1.55] text-[var(--de-text-secondary)]">
            This will permanently delete{" "}
            <strong className="text-[var(--de-text)]">{rowCount}</strong> row
            {rowCount === 1 ? "" : "s"}
            {scope ? (
              <>
                {" "}scoped to{" "}
                <code className="font-[var(--de-mono)] text-[var(--de-text)]">{scope}</code>
              </>
            ) : null}
            . The rows are removed from the local Dexie database and (if configured) from the
            REST backend on the next sync. This cannot be undone.
          </div>

          <Step
            number={1}
            title="Download a backup"
            description="Saves the same JSON that Export JSON produces — Import will round-trip it."
            done={backedUp}
          >
            <EditorButton
              onClick={handleBackup}
              disabled={rowCount === 0}
              icon={backedUp ? "lucide:check" : "lucide:download"}
              className={cn(
                backedUp &&
                  'border-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_35%,var(--de-border))] bg-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_12%,var(--de-bg))] text-[var(--de-success,var(--ds-accent-positive))]',
              )}
            >
              {backedUp ? "Backup downloaded" : "Download backup"}
            </EditorButton>
          </Step>

          <Step
            number={2}
            title="Type the table name to confirm"
            description={
              <>
                Type{" "}
                <code className="font-[var(--de-mono)] text-[var(--de-text)]">
                  {tableLabel}
                </code>{" "}
                exactly (case-insensitive).
              </>
            }
            done={typedMatches}
          >
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={tableLabel}
              disabled={!backedUp}
              className={cn(
                'h-[30px] bg-[var(--de-bg-surface)] font-[var(--de-mono)] text-xs text-[var(--de-text)] shadow-none',
                typedMatches
                  ? 'border-[var(--de-success,var(--ds-accent-positive))]'
                  : 'border-[var(--de-border)]',
              )}
            />
          </Step>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--de-border)] bg-[var(--de-bg-surface)] px-[18px] py-3">
          <span
            className={cn(
              'font-[var(--de-mono)] text-[11px]',
              canDelete
                ? 'text-[var(--de-danger,var(--ds-accent-negative))]'
                : 'text-[var(--de-text-tertiary)]',
            )}
          >
            {canDelete
              ? `Ready to delete ${rowCount} row${rowCount === 1 ? "" : "s"}`
              : !backedUp
                ? "Backup required"
                : !typedMatches
                  ? "Confirmation required"
                  : "—"}
          </span>
          <div className="flex-1" />
          <EditorButton onClick={onCancel}>Cancel</EditorButton>
          <Button
            type="button"
            size="sm"
            disabled={!canDelete}
            onClick={onConfirm}
            className={cn(
              'h-[30px] gap-1.5 px-3.5 text-xs font-semibold font-[var(--de-font)] shadow-none',
              canDelete
                ? 'bg-[var(--de-danger,var(--ds-accent-negative))] text-[var(--de-danger-foreground)] hover:bg-[var(--de-danger,var(--ds-accent-negative))]'
                : 'bg-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_30%,transparent)] text-[var(--de-danger-foreground)] opacity-60',
            )}
          >
            <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" />
            Delete all {rowCount > 0 ? rowCount : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
  done,
  children,
}: {
  number: number;
  title: string;
  description: ReactNode;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] p-3 transition-[border-color] duration-100',
        done
          ? 'border border-[var(--de-success,var(--ds-accent-positive))]'
          : 'border border-[var(--de-border)]',
      )}
    >
      <div
        className={cn(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-[var(--de-mono)] text-[11px] font-bold',
          done
            ? 'bg-[var(--de-success,var(--ds-accent-positive))] text-[var(--ds-text-primary)]'
            : 'bg-[var(--de-bg)] text-[var(--de-text-secondary)]',
        )}
      >
        {done ? <Icon icon="lucide:check" className="h-3 w-3" /> : number}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div>
          <div className="text-[12px] font-semibold text-[var(--de-text)]">{title}</div>
          <div className="mt-0.5 text-[11px] text-[var(--de-text-tertiary)]">{description}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
