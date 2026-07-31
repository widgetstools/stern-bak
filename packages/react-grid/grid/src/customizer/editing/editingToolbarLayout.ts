/** Layout mode for editing-family toolbar segments inside the unified row. */
export type EditingToolbarLayout = 'standalone' | 'segment';

export interface EditingToolbarSegmentProps {
  /** `standalone` = legacy full-width row; `segment` = inline in unified toolbar. */
  layout?: EditingToolbarLayout;
}
