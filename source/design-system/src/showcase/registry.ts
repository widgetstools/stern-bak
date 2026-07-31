import type { ShowcaseEntry, ShowcaseCategory } from './types';
export { SHOWCASE_CATEGORIES } from './types';
import { buttonsEntries } from './components/buttons';
import { inputsEntries } from './components/inputs';
import { selectionEntries } from './components/selection';
import { overlaysEntries } from './components/overlays';
import { navigationEntries } from './components/navigation';
import { dataDisplayEntries } from './components/dataDisplay';
import { feedbackEntries } from './components/feedback';
import { layoutEntries } from './components/layout';
import { chartsEntries } from './components/charts';

export const SHOWCASE_ENTRIES: ShowcaseEntry[] = [
  ...buttonsEntries, ...inputsEntries, ...selectionEntries, ...overlaysEntries,
  ...navigationEntries, ...dataDisplayEntries, ...feedbackEntries, ...layoutEntries,
  ...chartsEntries,
];

export function entriesByCategory(): Record<ShowcaseCategory, ShowcaseEntry[]> {
  const out = {} as Record<ShowcaseCategory, ShowcaseEntry[]>;
  for (const e of SHOWCASE_ENTRIES) (out[e.category] ??= []).push(e);
  return out;
}
