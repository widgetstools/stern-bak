/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useState, useRef, useEffect } from "react";
// /config subpath — side-effect-free; safe in plain-browser dev contexts.
import {
  importConfigBundle,
  IAB_RELOAD_AFTER_IMPORT,
  IAB_REGISTRY_CONFIG_UPDATE,
  type ImportConfigBundleResult,
} from "@wellsfargo-starui/openfin/config";
import { UPLOAD_SVG } from "@wellsfargo-starui/design-system/icons/all-icons";
import { spacing, typography } from "@wellsfargo-starui/design-system/tokens";

// ─── Types ───────────────────────────────────────────────────────────

type ImportStatus = "idle" | "success" | "error";

// ─── Design tokens ───────────────────────────────────────────────────
// Maps to the --de-* editor design system from @wellsfargo-starui/design-system.
// This component always renders in dark mode (utility dialog).
const COLORS = {
  accent:        "var(--de-accent)",
  danger:        "var(--de-danger)",
  success:       "var(--de-success)",
  bg:            "var(--de-bg-deep)",
  surface:       "var(--de-bg-surface)",
  border:        "var(--de-border-strong)",
  textPrimary:   "var(--de-text)",
  textSecondary: "var(--de-text-secondary)",
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Returns true when the app is running inside an OpenFin window. */
const isInOpenFin = typeof (window as any).fin !== "undefined";

// ─── Component ───────────────────────────────────────────────────────

/**
 * ImportConfig — hosted in a small OpenFin window at /import-config.
 *
 * Lets the user upload a JSON file previously exported via "Export Config".
 * On successful import it reloads the dock and closes this window.
 */
export default function ImportConfig() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup: clear the auto-close timer if component unmounts early
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── Handle file selection ─────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus("idle");
    setMessage("");

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate: the exported JSON must have an "appConfig" array.
      // This is the shape produced by the "Export Config" action.
      if (!importData.appConfig || !Array.isArray(importData.appConfig)) {
        setStatus("error");
        setMessage("No config data found in this file. Make sure it is a valid config export.");
        return;
      }

      // Bulk-import every supported section. The helper re-owns appConfig
      // rows (rewrites appId/userId to the local host environment) so
      // workspaces, registries, and per-instance markets-grid-profile-set
      // rows — including the `gridLevelData` that carries data-provider
      // selection — become readable on this machine. userProfile rows are
      // intentionally excluded from auto-import (see `importConfigBundle`).
      const result = await importConfigBundle(importData);

      if (result.totalImported === 0) {
        setStatus("error");
        setMessage("No importable rows found in this file.");
        return;
      }

      // Notify other surfaces. IAB_RELOAD_AFTER_IMPORT prompts the dock
      // provider window to reload its buttons; IAB_REGISTRY_CONFIG_UPDATE
      // tells the registry editor / launchers to re-read the registry.
      if (isInOpenFin) {
        const iab = (window as any).fin.InterApplicationBus;
        await iab.publish(IAB_RELOAD_AFTER_IMPORT, {});
        if (result.appConfig.imported > 0) {
          await iab.publish(IAB_REGISTRY_CONFIG_UPDATE, {});
        }
      }

      setStatus("success");
      setMessage(formatSuccessMessage(result));

      // Auto-close after 1.5 s so the user can read the success message
      closeTimerRef.current = setTimeout(async () => {
        if (isInOpenFin) {
          await (window as any).fin.Window.getCurrentSync().close();
        }
      }, 1500);
    } catch (err) {
      console.error("Import failed:", err);
      setStatus("error");
      setMessage("Failed to read the file. Make sure it is a valid config export.");
    }
  }

  function formatSuccessMessage(r: ImportConfigBundleResult): string {
    const parts: string[] = [];
    if (r.appConfig.imported)   parts.push(`${r.appConfig.imported} config row${r.appConfig.imported === 1 ? '' : 's'}`);
    if (r.appRegistry.imported) parts.push(`${r.appRegistry.imported} app${r.appRegistry.imported === 1 ? '' : 's'}`);
    if (r.roles.imported)       parts.push(`${r.roles.imported} role${r.roles.imported === 1 ? '' : 's'}`);
    if (r.permissions.imported) parts.push(`${r.permissions.imported} permission${r.permissions.imported === 1 ? '' : 's'}`);
    const summary = parts.length > 0 ? `Imported ${parts.join(', ')}.` : 'Import complete.';
    return r.totalFailed > 0
      ? `${summary} ${r.totalFailed} row${r.totalFailed === 1 ? '' : 's'} failed — see console for details.`
      : summary;
  }

  // ── Render ───────────────────────────────────────────────────────
  // Destructure COLORS for convenience in JSX
  const { accent: accentColor, danger: dangerColor, success: successColor,
          bg, surface, border, textPrimary, textSecondary } = COLORS;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: bg, color: textPrimary,
      fontFamily: "var(--ds-font-sans)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: spacing[6], padding: spacing[8],
    }}>
      {/* Icon */}
      <div style={{
        width: 56, height: 56, borderRadius: "var(--de-radius-lg)",
        background: surface, border: `1px solid ${border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div
          style={{ width: 28, height: 28, color: accentColor }}
          dangerouslySetInnerHTML={{
            __html: UPLOAD_SVG
              .replace(/width="24"/, 'width="28"')
              .replace(/height="24"/, 'height="28"')
              .replace(/stroke-width="2"/, 'stroke-width="1.8"'),
          }}
        />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1 style={{
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          margin: 0,
          color: textPrimary,
        }}>
          Import Config
        </h1>
        <p style={{
          fontSize: typography.fontSize.md,
          color: textSecondary,
          margin: `${spacing[1.5]}px 0 0`,
        }}>
          Select a previously exported config JSON file
        </p>
      </div>

      {/* Drop zone / file button */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%", maxWidth: 320,
          border: `1.5px dashed ${fileName ? accentColor : border}`,
          borderRadius: "var(--de-radius-md)",
          padding: `${spacing[5]}px ${spacing[4]}px`,
          textAlign: "center", cursor: "pointer",
          background: fileName ? `${accentColor}10` : surface,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}10`; }}
        onMouseLeave={e => {
          if (!fileName) {
            e.currentTarget.style.borderColor = border;
            e.currentTarget.style.background = surface;
          }
        }}
      >
        {fileName ? (
          <span style={{
            fontSize: typography.fontSize.md,
            color: accentColor,
            fontWeight: typography.fontWeight.medium,
          }}>
            {fileName}
          </span>
        ) : (
          <span style={{ fontSize: typography.fontSize.md, color: textSecondary }}>
            Click to select a <strong style={{ color: textPrimary }}>.json</strong> file
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Status message */}
      {message && (
        <p style={{
          fontSize: typography.fontSize.md,
          textAlign: "center",
          margin: 0,
          color: status === "success" ? successColor : dangerColor,
        }}>
          {message}
        </p>
      )}

      {/* Close button */}
      <button
        onClick={async () => {
          if (isInOpenFin) {
            await (window as any).fin.Window.getCurrentSync().close();
          }
        }}
        style={{
          padding: `${spacing[2]}px ${spacing[6]}px`,
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.medium,
          border: `1px solid ${border}`, borderRadius: "var(--de-radius-sm)",
          background: "transparent", color: textSecondary,
          cursor: "pointer", transition: "all 0.12s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = textSecondary; e.currentTarget.style.color = textPrimary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = textSecondary; }}
      >
        Cancel
      </button>
    </div>
  );
}
