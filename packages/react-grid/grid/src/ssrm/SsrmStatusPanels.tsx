/**
 * SSRM status-bar panels — same chrome and labels as AG Grid's built-ins.
 *
 * The grid's own panels walk row nodes. Under SSRM those are the loaded
 * blocks, so we render the same `ag-status-name-value` markup with numbers
 * from {@link useSsrmStatusModel} (engine totals / filter / aggregates).
 */
import type { ReactElement } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { useSsrmStatusModel, type SsrmStatusModel } from './useSsrmStatusModel.js';

export type SsrmAggFunc = 'count' | 'sum' | 'min' | 'max' | 'avg';

export interface SsrmStatusPanelParams {
  api: GridApi;
  provider: ISsrmDataProvider;
  /** Same subset CSRM's `agAggregationComponent` accepts. */
  aggFuncs?: readonly SsrmAggFunc[];
  /** Same hook CSRM's count panels accept. */
  valueFormatter?: (params: { value: number }) => string;
}

function formatCount(
  n: number,
  format?: (params: { value: number }) => string,
): string {
  return format ? format({ value: n }) : n.toLocaleString();
}

function formatAgg(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function NameValue({ name, value }: { name: string; value: string }): ReactElement {
  return (
    <div className="ag-status-name-value">
      <span>{name}:&nbsp;</span>
      <span className="ag-status-name-value-value">{value}</span>
    </div>
  );
}

function usePanelModel(params: SsrmStatusPanelParams): SsrmStatusModel {
  return useSsrmStatusModel(params.provider, params.api);
}

export function SsrmTotalAndFilteredStatusPanel(params: SsrmStatusPanelParams): ReactElement {
  const { total, filtered } = usePanelModel(params);
  return (
    <div className="ag-status-panel ag-status-panel-total-and-filtered-row-count" role="status">
      <NameValue name="Filtered" value={formatCount(filtered, params.valueFormatter)} />
      <NameValue name="Total" value={formatCount(total, params.valueFormatter)} />
    </div>
  );
}

export function SsrmFilteredStatusPanel(params: SsrmStatusPanelParams): ReactElement {
  const { filtered } = usePanelModel(params);
  return (
    <div className="ag-status-panel ag-status-panel-filtered-row-count" role="status">
      <NameValue name="Filtered" value={formatCount(filtered, params.valueFormatter)} />
    </div>
  );
}

export function SsrmTotalStatusPanel(params: SsrmStatusPanelParams): ReactElement {
  const { total } = usePanelModel(params);
  return (
    <div className="ag-status-panel ag-status-panel-total-row-count" role="status">
      <NameValue name="Total Rows" value={formatCount(total, params.valueFormatter)} />
    </div>
  );
}

export function SsrmSelectedStatusPanel(params: SsrmStatusPanelParams): ReactElement {
  const { selected } = usePanelModel(params);
  return (
    <div className="ag-status-panel ag-status-panel-selected-row-count" role="status">
      <NameValue name="Selected" value={formatCount(selected, params.valueFormatter)} />
    </div>
  );
}

const AGG_LABELS: ReadonlyArray<readonly [SsrmAggFunc, string]> = [
  ['avg', 'avg'],
  ['count', 'count'],
  ['min', 'min'],
  ['max', 'max'],
  ['sum', 'sum'],
];

export function SsrmAggregationStatusPanel(params: SsrmStatusPanelParams): ReactElement {
  const { aggregates, aggregateColumn } = usePanelModel(params);
  const wanted = params.aggFuncs?.length ? new Set(params.aggFuncs) : null;
  return (
    <div className="ag-status-panel ag-status-panel-aggregations" role="status">
      {AGG_LABELS.filter(([fn]) => !wanted || wanted.has(fn)).map(([fn, label]) => {
        const value = aggregateColumn ? aggregates[`${aggregateColumn}_${fn}`] : undefined;
        return (
          <NameValue
            key={fn}
            name={label}
            value={value == null ? '–' : formatAgg(value)}
          />
        );
      })}
    </div>
  );
}
