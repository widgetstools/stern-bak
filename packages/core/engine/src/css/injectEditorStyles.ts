/**
 * Dock-editor design tokens — 100% derived from @wellsfargo-starui/design-system.
 *
 * Every `--de-*` variable in this block resolves to a design-system token
 * (`--ds-*` unified token system). The
 * `--de-*` names are kept purely as internal aliases so the component
 * code can reference familiar semantic names (accent/danger/etc.) while
 * the resolved values come from the one source of truth.
 *
 * Consumers must have the design-system theme CSS loaded at the app
 * root:
 *   @import '@wellsfargo-starui/design-system/css';
 * and set `<html data-theme="dark">` (or `light`). See
 * `packages/design-system/README.md`.
 */

// Tokens scoped to `:root, [data-dock-editor]` (not just `[data-dock-editor]`)
// so that modal portals — PrimeNG dialogs, Radix popovers, etc. — which
// render outside the component subtree still resolve every `--de-*` var.
const EDITOR_CSS = `
:root, [data-dock-editor] {
  /* ── Typography aliases → @wellsfargo-starui/design-system ── */
  --de-font: var(--ds-font-sans);
  --de-mono: var(--ds-font-mono);

  /* ── Surface aliases → --ds-surface-* ── */
  --de-bg-deep:    var(--ds-surface-ground);
  --de-bg:         var(--ds-surface-primary);
  --de-bg-raised:  var(--ds-surface-primary);
  --de-bg-surface: var(--ds-surface-secondary);
  --de-bg-hover:   var(--ds-surface-tertiary);
  --de-bg-active:  var(--ds-surface-tertiary);

  /* ── Border aliases → --ds-border-* ── */
  --de-border:         var(--ds-border-primary);
  --de-border-subtle:  var(--ds-border-primary);
  --de-border-strong:  var(--ds-border-secondary);

  /* ── Text aliases → --ds-text-* ── */
  --de-text:           var(--ds-text-primary);
  --de-text-secondary: var(--ds-text-secondary);
  --de-text-tertiary:  var(--ds-text-muted);
  --de-text-ghost:     var(--ds-text-faint);

  /* ── Semantic colors → design-system accents ──
   * --de-accent is the PRIMARY BRAND accent — maps to --ds-primary
   * (the design-system brand primary, used for CTAs / active states /
   * focus rings everywhere else in the app). NOT --ds-accent-info
   * (which is reserved for INFO semantics — status, links, pending).
   * NOT --ds-accent-warning (reserved for WARNING semantics). */
  --de-accent:           var(--ds-primary);
  --de-accent-dim:       var(--ds-primary-soft);
  --de-accent-subtle:    var(--ds-primary-soft);
  --de-accent-foreground:var(--ds-primary-foreground);

  --de-danger:            var(--ds-accent-negative);
  --de-danger-dim:        var(--ds-overlay-negative-soft);
  /* Foreground for filled danger surfaces — the design-system destructive
   * foreground (dark text on the bright negative fill, themed per mode). */
  --de-danger-foreground: oklch(var(--destructive-foreground));
  --de-success:        var(--ds-accent-positive);

  /* ── Radii — flow through --ds-radius-* so editor chrome matches the
   * design-system's 2px baseline (the system pins sm = md = lg = 2px
   * for every standard rectangular component; xl = 6px is the opt-in
   * "intentionally rounder" tier — see primitives.ts). */
  --de-radius-sm: var(--ds-radius-sm);
  --de-radius-md: var(--ds-radius-md);
  --de-radius-lg: var(--ds-radius-lg);
  --de-radius-xl: var(--ds-radius-xl);

  /* ── Shadows → design-system elevation tokens. These self-theme via
   * --ds-* when [data-theme] flips, so no per-mode overrides are needed.
   * The system ships two elevation tiers (card, overlay); md and lg both
   * resolve to the overlay tier. ── */
  --de-shadow-sm:   var(--ds-elevation-card);
  --de-shadow-md:   var(--ds-elevation-overlay);
  --de-shadow-lg:   var(--ds-elevation-overlay);
  --de-shadow-glow: 0 0 20px var(--ds-primary-soft);

  font-family: var(--de-font);
  color: var(--de-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* No per-theme shadow overrides needed: every --de-* token (including the
 * shadows above) delegates to a --ds-* design-system token that re-resolves
 * automatically when the root [data-theme] attribute flips. */

@keyframes de-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes de-scale-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes de-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes de-pulse-subtle {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

@keyframes de-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

@keyframes de-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Themed scrollbars ───────────────────────────────────────────────
 * Used by .bn-scrollbar (any element that scrolls inside the editor
 * shells). Track + thumb derive from --ds-surface-secondary / --ds-border-primary so they
 * flip cleanly when [data-theme] changes on the document root.
 *
 * Pure-CSS approach so the same rule works in every browser the
 * platform supports — Chromium uses ::-webkit-scrollbar, others fall
 * back to scrollbar-color (Firefox, recent WebKit).
 */
.bn-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--ds-border-secondary, var(--ds-border-primary)) transparent;
}
.bn-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.bn-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.bn-scrollbar::-webkit-scrollbar-thumb {
  background: var(--ds-border-secondary, var(--ds-border-primary));
  border: 2px solid var(--ds-surface-ground);
  border-radius: 2px;
}
.bn-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--ds-text-faint, var(--ds-text-muted));
}
.bn-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}
`;

let injected = false;

/**
 * Inject the dock-editor token alias block into the document head.
 *
 * All tokens resolve to `@wellsfargo-starui/design-system` primitives, so the
 * design-system theme CSS (`fi-dark.css`, `fi-light.css`) MUST already
 * be loaded in the consuming app's root stylesheet, and `data-theme`
 * MUST be set on `<html>` (see the design-system README for the
 * prescribed pattern).
 */
export function injectEditorStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.setAttribute("data-dock-editor-styles", "");
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);
  injected = true;
}
