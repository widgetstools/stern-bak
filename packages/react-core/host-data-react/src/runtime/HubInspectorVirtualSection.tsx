import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { Separator, TableBody, TableHeader } from '@wellsfargo-starui/react';

const MAIN_ROW_HEIGHT = 44;
const DETAIL_ROW_HEIGHT = 288;

export type HubVirtualFlatItem<T> =
  | { kind: 'main'; id: string; row: T }
  | { kind: 'detail'; id: string; row: T };

export type HubInspectorRowMeasureProps = {
  virtualIndex: number;
  measureRef: (element: Element | null) => void;
};

export function flattenHubInspectorRows<T>(
  rows: readonly T[],
  expandedId: string | null,
  getRowId: (row: T) => string,
  canExpand: (row: T) => boolean,
): HubVirtualFlatItem<T>[] {
  const items: HubVirtualFlatItem<T>[] = [];
  for (const row of rows) {
    const rowId = getRowId(row);
    items.push({ kind: 'main', id: `main:${rowId}`, row });
    if (expandedId === rowId && canExpand(row)) {
      items.push({ kind: 'detail', id: `detail:${rowId}`, row });
    }
  }
  return items;
}

export interface HubInspectorVirtualSectionProps<T> {
  title: string;
  rows: readonly T[];
  expandedId: string | null;
  getRowId: (row: T) => string;
  canExpand: (row: T) => boolean;
  emptyMessage: string;
  columnCount: number;
  colGroup: React.ReactNode;
  tableHeader: React.ReactNode;
  renderMainRow: (row: T, measure: HubInspectorRowMeasureProps) => React.ReactNode;
  renderDetailRow: (row: T, measure: HubInspectorRowMeasureProps) => React.ReactNode;
}

export function HubInspectorVirtualSection<T>({
  title,
  rows,
  expandedId,
  getRowId,
  canExpand,
  emptyMessage,
  columnCount,
  colGroup,
  tableHeader,
  renderMainRow,
  renderDetailRow,
}: HubInspectorVirtualSectionProps<T>): React.ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => flattenHubInspectorRows(rows, expandedId, getRowId, canExpand),
    [rows, expandedId, getRowId, canExpand],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (items[index]?.kind === 'detail' ? DETAIL_ROW_HEIGHT : MAIN_ROW_HEIGHT),
    overscan: 6,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <Separator className="shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed caption-bottom text-sm">
              {colGroup}
              <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-border [&_th]:bg-background [&_tr]:border-b-0">
                {tableHeader}
              </TableHeader>
              <TableBody>
                {paddingTop > 0 ? (
                  <tr aria-hidden className="border-0 hover:bg-transparent">
                    <td
                      colSpan={columnCount}
                      className="border-0 p-0"
                      style={{ height: paddingTop, lineHeight: 0 }}
                    />
                  </tr>
                ) : null}
                {virtualRows.map((virtualRow) => {
                  const item = items[virtualRow.index];
                  if (!item) return null;
                  const measure: HubInspectorRowMeasureProps = {
                    virtualIndex: virtualRow.index,
                    measureRef: virtualizer.measureElement,
                  };
                  return item.kind === 'main'
                    ? renderMainRow(item.row, measure)
                    : renderDetailRow(item.row, measure);
                })}
                {paddingBottom > 0 ? (
                  <tr aria-hidden className="border-0 hover:bg-transparent">
                    <td
                      colSpan={columnCount}
                      className="border-0 p-0"
                      style={{ height: paddingBottom, lineHeight: 0 }}
                    />
                  </tr>
                ) : null}
              </TableBody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
