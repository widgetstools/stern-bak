/**
 * Keyboard chords that toggle the data-provider toolbar (ProviderToolbar).
 *
 * - Alt+Shift+P — Windows/Linux (Alt) and macOS (Option); mnemonic "Provider".
 * - Meta+Shift+P — macOS (Command) alternate; same chord on Windows uses Win key.
 *
 * Ctrl+Shift+P is intentionally omitted — Chromium binds it to incognito/private
 * window and the page never receives the keydown.
 */
export const PROVIDER_TOOLBAR_TOGGLE_CHORDS = [
  'Alt+Shift+P',
  'Meta+Shift+P',
] as const;

/** Human-readable hint for docs / dev footers. */
export const PROVIDER_TOOLBAR_TOGGLE_HINT =
  'Alt+Shift+P (Windows/Linux) or Option+Shift+P / Cmd+Shift+P (macOS)';
