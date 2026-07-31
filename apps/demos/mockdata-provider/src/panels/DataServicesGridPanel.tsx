import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from '@wellsfargo-starui/grid';
import {
  useDataProvider,
  useProviderStats,
} from '@wellsfargo-starui/host-data-react/runtime';
import type { MockProviderConfig } from '@wellsfargo-starui/types';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';
import { getPlatform } from '../platformBootstrap';

const storage = createMarketsGridLocalStorageStorage();

export function DataServicesGridPanel() {
  const { cfg } = useMockConfig();
  const { recordTick } = useStats();
  const dataType = (cfg.dataType ?? 'positions') as 'positions' | 'trades' | 'orders';
  const gridId = `mockdata-via-ds-${dataType}-v1`;
  const providerId = `mock-${dataType}`;
  const { columnDefs, rowIdField, defaultColDef } = columnDefsByType[dataType];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [deltaCount, setDeltaCount] = useState(0);
  const rowsRef = useRef<Record<string, unknown>[]>([]);

  const cfgForHub = useMemo<MockProviderConfig>(
    () => ({ ...cfg, keyColumn: rowIdField }),
    [cfg, rowIdField],
  );

  const inlineCfg = useMemo(() => cfgForHub, [cfgForHub]);

  const { provider, status: streamStatus, error: streamError } = useDataProvider<
    Record<string, unknown>
  >(providerId, { inlineCfg });

  useEffect(() => {
    rowsRef.current = [];
    setDeltaCount(0);
    setRows([]);
    // eslint-disable-next-line no-console
    console.log('[ds-panel] dataType swap →', dataType, 'providerId =', providerId, 'rowIdField =', rowIdField);
  }, [dataType, providerId, rowIdField]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ds-panel] cfgForHub changed →', cfgForHub);
  }, [cfgForHub]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ds-panel] awaiting services.ready ...');
    getPlatform().ready.then(
      () => console.log('[ds-panel] services.ready RESOLVED — SharedWorker is alive'),
      (err) => console.error('[ds-panel] services.ready REJECTED', err),
    );
  }, []);

  useProviderStats(providerId, {
    onStats: (stats) => {
      // eslint-disable-next-line no-console
      console.log('[ds-panel] onStats:', stats);
    },
  });

  useEffect(() => {
    if (!provider) return;

    const unsubSnapshot = provider.onSnapshotData((incoming) => {
      rowsRef.current = [...incoming];
      setRows(rowsRef.current);
      recordTick('dataservices', Date.now(), rowsRef.current.length);
    });

    const unsubTick = provider.onTick((incoming) => {
      if (incoming.length === 0) return;
      setDeltaCount((n) => n + 1);
      // eslint-disable-next-line no-console
      console.log(
        `[ds-panel] onTick: incoming.length=${incoming.length}`,
        incoming.length > 0
          ? { firstRowKey: incoming[0]?.[rowIdField], firstRow: incoming[0] }
          : undefined,
      );
      rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
      setRows([...rowsRef.current]);
      recordTick('dataservices', Date.now(), rowsRef.current.length);
    });

    return () => {
      unsubSnapshot();
      unsubTick();
    };
  }, [provider, rowIdField, recordTick]);

  // eslint-disable-next-line no-console
  console.log('[ds-panel] render: status=', streamStatus, 'rows=', rows.length);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-1.5 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">
        <span><span className="text-[color:var(--ds-text-faint)]">provider </span><span className="text-[color:var(--ds-text-primary)]">{providerId}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">keyColumn </span><span className="text-[color:var(--ds-text-primary)]">{rowIdField}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">status </span><span className="text-[color:var(--ds-text-primary)]">{streamStatus}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">deltas </span><span className="text-[color:var(--ds-text-primary)]">{deltaCount}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">rows </span><span className="text-[color:var(--ds-text-primary)]">{rows.length}</span></span>
        {streamError ? (
          <>
            <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
            <span className="text-[color:var(--ds-accent-negative)]">error: {streamError}</span>
          </>
        ) : null}
      </div>
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
        componentName={`DataServices · ${dataType}`}
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
