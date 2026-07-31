/**
 * Shared types for the HelpPanel section registry. The shell in
 * HelpPanel.tsx drives a section list (rail) + active section body.
 * Each section component lives in its own module under ./help/.
 */

import type { ComponentType } from 'react';

export type SectionId =
  | 'overview'
  | 'excel'
  | 'trading'
  | 'expressions'
  | 'traffic-light'
  | 'emojis';

/**
 * Props the shell passes to each section component. Only Overview
 * uses `navigateTo` (for its in-body "Jump to a section" buttons);
 * other sections accept and ignore it.
 */
export interface HelpSectionProps {
  readonly navigateTo: (id: SectionId) => void;
}

export interface HelpSection {
  readonly id: SectionId;
  readonly title: string;
  readonly Body: ComponentType<HelpSectionProps>;
}
