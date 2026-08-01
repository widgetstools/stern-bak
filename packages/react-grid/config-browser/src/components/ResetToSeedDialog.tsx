/**
 * ResetToSeedDialog — confirmation modal for wiping EVERY config table and
 * re-seeding from the runtime seed file (`ConfigManager.seedConfigUrl`).
 *
 * One guard rail (the user chose "backup only"): the Reset button stays
 * disabled until the user has downloaded a full-database backup. The backup
 * is the same bundle the Export-ALL action produces, so it round-trips via
 * Import and matches the seed.json shape.
 */

import { useState } from "react";
import { cn } from "@wellsfargo-starui/ui";
import { DynamicIcon as Icon } from "../icons.js"; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { EditorButton } from "./EditorButton";

interface ResetToSeedDialogProps {
  /** The seed-config URL the database will be reset from. */
  seedUrl: string;
  onCancel: () => void;
  onDownloadBackup: () => void;
  onConfirm: () => void;
}

export function ResetToSeedDialog({
  seedUrl,
  onCancel,
  onDownloadBackup,
  onConfirm,
}: ResetToSeedDialogProps) {
  const [backedUp, setBackedUp] = useState(false);

  const handleBackup = () => {
    onDownloadBackup();
    setBackedUp(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-seed-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/55 font-[var(--de-font)]"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-[var(--de-radius-md,2px)] border border-[var(--ds-accent-warning)] bg-[var(--de-bg)] shadow-[var(--ds-elevation-overlay)]"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--de-border)] bg-[color-mix(in_srgb,var(--ds-accent-warning)_8%,var(--de-bg))] px-[18px] py-[14px]">
          <Icon
            icon="lucide:database-backup"
            className="h-4 w-4 text-[var(--ds-accent-warning)]"
          />
          <span id="reset-seed-title" className="text-[13px] font-semibold text-[var(--de-text)]">
            Reset all config to seed
          </span>
        </div>

        <div className="flex flex-col gap-[14px] px-[18px] py-4">
          <div className="text-[12px] leading-[1.55] text-[var(--de-text-secondary)]">
            This permanently replaces <strong className="text-[var(--de-text)]">every</strong>{" "}
            config table — App Config, App Registry, User Profiles, Roles and
            Permissions — with the contents of the seed file at{" "}
            <code className="font-[var(--de-mono)] text-[var(--de-text)]">{seedUrl}</code>
            . Any changes you've made locally that aren't in the seed will be
            lost. This cannot be undone.
          </div>

          <div
            className={cn(
              "flex gap-3 rounded-[var(--de-radius-sm)] bg-[var(--de-bg-surface)] p-3 transition-[border-color] duration-100",
              backedUp
                ? "border border-[var(--de-success,var(--ds-accent-positive))]"
                : "border border-[var(--de-border)]",
            )}
          >
            <div
              className={cn(
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-[var(--de-mono)] text-[11px] font-bold",
                backedUp
                  ? "bg-[var(--de-success,var(--ds-accent-positive))] text-[var(--ds-text-primary)]"
                  : "bg-[var(--de-bg)] text-[var(--de-text-secondary)]",
              )}
            >
              {backedUp ? <Icon icon="lucide:check" className="h-3 w-3" /> : 1}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div>
                <div className="text-[12px] font-semibold text-[var(--de-text)]">
                  Download a backup first
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--de-text-tertiary)]">
                  Saves the full config bundle (all tables) — Import round-trips
                  it, so you can restore if needed.
                </div>
              </div>
              <EditorButton
                onClick={handleBackup}
                icon={backedUp ? "lucide:check" : "lucide:download"}
                className={cn(
                  backedUp &&
                    "border-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_35%,var(--de-border))] bg-[color-mix(in_srgb,var(--de-success,var(--ds-accent-positive))_12%,var(--de-bg))] text-[var(--de-success,var(--ds-accent-positive))]",
                )}
              >
                {backedUp ? "Backup downloaded" : "Download backup"}
              </EditorButton>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--de-border)] bg-[var(--de-bg-surface)] px-[18px] py-3">
          <span
            className={cn(
              "font-[var(--de-mono)] text-[11px]",
              backedUp ? "text-[var(--de-text-secondary)]" : "text-[var(--de-text-tertiary)]",
            )}
          >
            {backedUp ? "Ready to reset" : "Backup required"}
          </span>
          <div className="flex-1" />
          <EditorButton onClick={onCancel}>Cancel</EditorButton>
          <EditorButton
            onClick={onConfirm}
            disabled={!backedUp}
            variant="primary"
            icon="lucide:database-backup"
          >
            Reset to seed
          </EditorButton>
        </div>
      </div>
    </div>
  );
}
