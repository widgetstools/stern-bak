import type { ReactNode } from 'react';

export type ShowcaseCategory =
  | 'buttons' | 'inputs' | 'selection' | 'overlays'
  | 'navigation' | 'data-display' | 'feedback' | 'layout' | 'charts';

export const SHOWCASE_CATEGORIES: { id: ShowcaseCategory; label: string }[] = [
  { id: 'buttons', label: 'Buttons & Actions' },
  { id: 'inputs', label: 'Inputs & Forms' },
  { id: 'selection', label: 'Selection' },
  { id: 'overlays', label: 'Overlays & Dialogs' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'data-display', label: 'Data Display' },
  { id: 'feedback', label: 'Feedback & Status' },
  { id: 'layout', label: 'Layout & Disclosure' },
  { id: 'charts', label: 'Charts' },
];

export interface ShowcaseEntry {
  /** Matches the `@wellsfargo-starui/react` component file basename, e.g. 'alert-dialog', 'button'. */
  id: string;
  name: string;
  category: ShowcaseCategory;
  importLine: string;
  code: string;
  Demo: () => ReactNode;
}
