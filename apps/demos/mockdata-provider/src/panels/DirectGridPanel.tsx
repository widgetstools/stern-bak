import { useEffect, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from '@wellsfargo-starui/grid';
import { startMock } from '@wellsfargo-starui/host-data';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';

type ProviderHandle = ReturnType<typeof startMock>;

const storage = createMarketsGridLocalStorageStorage();

export function DirectGridPanel() {
  const { cfg } = useMockConfig();
  const { recordTick } = useStats();
  const dataType = (cfg.dataType ?? 'positions') as 'positions' | 'trades' | 'orders';
  const gridId = `mockdata-direct-${dataType}-v1`;
  const { columnDefs, rowIdField, defaultColDef } = columnDefsByType[dataType];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const rowsRef = useRef<Record<string, unknown>[]>([]);
  const handleRef = useRef<ProviderHandle | null>(null);

  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
    handleRef.current = startMock(cfg, (evt) => {
      if ('rows' in evt) {
        const incoming = evt.rows as Record<string, unknown>[];
        if (evt.replace) {
          rowsRef.current = [...incoming];
        } else {
          rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
        }
        setRows(rowsRef.current);
        recordTick('direct', Date.now(), rowsRef.current.length);
      }
    });
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [cfg, rowIdField, recordTick]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <MarketsGrid
        key={gridId}
        gridId={gridId}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowIdField={rowIdField}
        storage={storage}
        showFiltersToolbar
        showFormattingToolbar
        showEditingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        componentName={`Direct · ${cfg.dataType}`}
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
      />
    </div>
  );
}
