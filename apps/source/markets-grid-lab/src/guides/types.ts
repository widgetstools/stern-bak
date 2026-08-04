/** Sidebar category a feature belongs to. */
export type LabCategoryId =
  | 'getting-started'
  | 'formatting-display'
  | 'columns-layout'
  | 'filtering-data'
  | 'editing'
  | 'profiles'
  | 'performance';

/** One numbered step in the Inspector "Try this" tab. */
export interface FeatureGuideTryStep {
  text: string;
  /** Optional secondary hint shown muted under the step. */
  hint?: string;
}

/** One row in the Inspector "Props / API" table. */
export interface FeatureGuidePropRow {
  name: string;
  type: string;
  default?: string;
  note: string;
}

/** A hand-authored extra config block (module config the derived blocks miss). */
export interface FeatureGuideConfigBlock {
  label: string;
  lang: 'json' | 'tsx';
  code: string;
}

/**
 * Declarative description of one feature tab, rendered by the Inspector drawer.
 * Config blocks are mostly DERIVED from the tab's LabFeatureConfig at render
 * time (see buildConfigBlocks); `extraConfig` is for module config that the
 * derivation can't see (e.g. conditional-styling rule arrays).
 */
export interface FeatureGuide {
  /** Matches the tab/`LabFeatureConfig.tabId`. */
  id: string;
  category: LabCategoryId;
  /** One-liner for the page header and Home feature-map card. */
  summary: string;
  /** Markdown — "what it does, when to use it, gotchas". */
  whatWhy: string;
  trySteps: FeatureGuideTryStep[];
  /** Feature-specific props (BASE_PROPS are prepended by the shell). */
  props: FeatureGuidePropRow[];
  /** Optional hand-authored config blocks appended after derived ones. */
  extraConfig?: FeatureGuideConfigBlock[];
  docsHref?: string;
}
