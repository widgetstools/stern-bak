/**
 * Re-export the shared `--de-*` token alias bridge from @wellsfargo-starui/core.
 * The Config Browser uses the same design-system token block as the
 * dock / registry editors, so consumers need only import from one place.
 */
export { injectEditorStyles } from "@wellsfargo-starui/core";
