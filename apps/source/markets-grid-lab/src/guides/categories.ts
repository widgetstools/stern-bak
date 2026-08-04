import type { LabCategoryId } from './types';

export interface LabCategory {
  id: LabCategoryId;
  label: string;
  /** Tab ids in display order. `home` is the synthetic landing tab. */
  tabIds: string[];
}

/**
 * Sidebar grouping. Order here is the order shown in the nav. Every id except
 * `home` must correspond to an existing tab in App.tsx; `home` is new.
 */
export const LAB_CATEGORIES: LabCategory[] = [
  { id: 'getting-started', label: 'Getting Started', tabIds: ['home', 'overview'] },
  {
    id: 'formatting-display',
    label: 'Formatting & Display',
    tabIds: ['formatting', 'renderers', 'conditional', 'toolbar', 'visual-excel'],
  },
  { id: 'columns-layout', label: 'Columns & Layout', tabIds: ['groups', 'calc'] },
  { id: 'filtering-data', label: 'Filtering & Live Data', tabIds: ['filters', 'live', 'alerts'] },
  { id: 'editing', label: 'Editing', tabIds: ['editing', 'bulk-update', 'plus-minus', 'shortcuts'] },
  { id: 'profiles', label: 'Profiles & Persistence', tabIds: ['profiles'] },
  { id: 'performance', label: 'Performance', tabIds: ['stress'] },
];
