import type { CSSProperties } from 'react';

/**
 * Public props for <ExpressionEditor>.
 *
 * Designed to absorb every call site (7 today): conditional-styling,
 * calculated-columns, cell-flashing, entitlements, named-queries, the
 * expression-editor playground, and the future formula bar. Variance
 * between sites (single-line vs multi-line, live vs on-commit, validated
 * vs optional) is absorbed by props — ONE editor everywhere.
 */
export interface ExpressionEditorProps {
  /** Initial expression text. Uncontrolled model: the editor maintains its
   *  own local state between commits. Changes to this prop after mount reset
   *  the editor (useful when a parent switches which rule is being edited). */
  value: string;
  /** Fires on blur OR when the user presses Enter (Ctrl+Enter in multiline
   *  mode). Same commit model as the existing PropText / Input pattern so
   *  module stores and debounced autosave paths are unchanged. */
  onCommit: (value: string) => void;
  /** Live text stream — optional. Only wire when the caller needs real-time
   *  re-validation (the playground does for live evaluation). */
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Compact single-line (default) vs multi-line. */
  multiline?: boolean;
  /** Number of lines when multiline. Default 4. */
  lines?: number;
  /** Monospace font size. Default 11. */
  fontSize?: number;
  /** Live column list for autocomplete. When omitted, the columns section of
   *  the suggest widget is empty but function autocomplete still works. Must
   *  be a stable function reference across renders — re-subscribes on change. */
  columnsProvider?: () => Array<{ colId: string; headerName: string; dataType?: string }>;
  /** Override the function catalog. Defaults to ExpressionEngine built-ins. */
  functionsProvider?: () => Array<{ name: string; category: string; signature: string; description: string }>;
  /** Show inline error markers. Default true. */
  validate?: boolean;
  /** Surface deprecation warnings for `{col}` column-ref syntax. Default true. */
  warnDeprecated?: boolean;
  /** Read-only mode. */
  readOnly?: boolean;
  /** Optional host class (e.g. flex child, `min-h-0`, utility layout). */
  className?: string;
  /** Merged onto the Monaco host after built-in layout styles; last wins for duplicate keys. */
  style?: CSSProperties;
  /** Test id passthrough. */
  'data-testid'?: string;
}

/** Imperative API on the editor ref — used by the formula bar to steal focus
 *  when the active cell changes. */
export interface ExpressionEditorHandle {
  focus(): void;
  getValue(): string;
}
