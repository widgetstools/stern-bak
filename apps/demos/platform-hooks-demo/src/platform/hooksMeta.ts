import type { MarketsGridHandlerMeta } from '@wellsfargo-starui/grid';

export const gridHandlerMeta: MarketsGridHandlerMeta = {
  'log-grid-ready': {
    label: 'Log grid ready',
    description: 'Fires when AG-Grid and the profile pipeline are ready.',
  },
  'log-grid-destroyed': {
    label: 'Log grid destroyed',
    description: 'Fires when the grid instance is tearing down.',
  },
  'log-profile-loaded': {
    label: 'Log profile loaded',
    description: 'Fires when a profile is applied to the grid.',
  },
  'log-profile-saved': {
    label: 'Log profile saved',
    description: 'Fires when the user saves the active grid profile.',
  },
  'log-profile-deleted': {
    label: 'Log profile deleted',
    description: 'Fires when a profile is removed.',
  },
  'log-provider-status': {
    label: 'Log provider status',
    description: 'Fires on every provider status transition.',
  },
  'log-provider-switched': {
    label: 'Log provider switch',
    description: 'Fires when live/historical provider or mode changes.',
  },
  'log-data-stale': {
    label: 'Log stale banner',
    description: 'Fires when the stale-data banner toggles.',
  },
  'log-toolbar-date': {
    label: 'Log toolbar date',
    description: 'Fires when the toolbar as-of date changes.',
  },
  'log-first-data-rendered': {
    label: 'Log first data rendered',
    description: 'Fires when AG-Grid renders rows for the first time.',
  },
  'log-row-data-updated': {
    label: 'Log row data updated',
    description: 'Fires when the underlying row model changes.',
  },
  'log-cell-clicked': {
    label: 'Log cell click',
    description: 'Fires when the user clicks a grid cell.',
  },
  'log-cell-value-changed': {
    label: 'Log cell value changed',
    description: 'Fires when the user edits a cell value.',
  },
  'log-filter-changed': {
    label: 'Log filter change',
    description: 'Fires when column filters change.',
  },
};
