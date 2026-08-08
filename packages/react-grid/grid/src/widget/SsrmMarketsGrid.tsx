import type { CSSProperties } from 'react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { MarketsGrid } from './MarketsGrid.js';

export interface SsrmMarketsGridProps {
  provider: ISsrmDataProvider;
  columnDefs?: ColDef[];
  keyColumn?: string;
  getQuickFilterText?: () => string;
  style?: CSSProperties;
  className?: string;
  onGridReady?: (event: GridReadyEvent) => void;
  /** Optional caption above the grid. */
  title?: string;
}

/** @deprecated Prefer `<MarketsGrid ssrm={{ provider }} … />` for full chrome. */
export function SsrmMarketsGrid(props: SsrmMarketsGridProps) {
  return (
    <MarketsGrid
      gridId={props.provider.id}
      ssrm={{
        provider: props.provider,
        keyColumn: props.keyColumn,
        getQuickFilterText: props.getQuickFilterText,
      }}
      columnDefs={props.columnDefs ?? []}
      rowData={[]}
      showToolbar={Boolean(props.title)}
      showSettingsButton
      showFormattingToolbar
      showEditingToolbar
      style={props.style}
      className={props.className}
      onGridReady={props.onGridReady}
    />
  );
}
