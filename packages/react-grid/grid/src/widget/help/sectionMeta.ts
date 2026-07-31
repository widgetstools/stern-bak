/**
 * Section list metadata: id + display title. Pure data — no React,
 * no JSX. Used by both the shell's rail and the Overview's in-body
 * jump-buttons.
 *
 * Adding a section: append here, add the matching SectionId to
 * ./types.ts, and add the body entry to ./sections.tsx.
 */

import type { SectionId } from './types';

export const SECTION_META: ReadonlyArray<{ id: SectionId; title: string }> = [
  { id: 'overview', title: 'Overview' },
  { id: 'excel', title: '1. Excel Format Strings' },
  { id: 'trading', title: '2. Trading-Specific Formats' },
  { id: 'expressions', title: '3. Expression Syntax' },
  { id: 'traffic-light', title: '4. Traffic Light Walkthrough' },
  { id: 'emojis', title: '5. Emoji Gallery' },
];
