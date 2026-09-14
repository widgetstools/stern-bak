import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

function pushGroups(provider: ISsrmDataProvider, api: GridApi): void {
  const groupBy = (api.getRowGroupColumns?.() ?? []).map((c) => c.getColId());
  const aggregates: Record<string, string> = {};
  for (const col of api.getValueColumns?.() ?? []) {
    aggregates[col.getColId()] = col.getAggFunc() ? String(col.getAggFunc()) : 'sum';
  }
  void provider.watchGroups({ groupBy, aggregates }).catch(() => undefined);
}

export function watchGroupsFromApi(provider: ISsrmDataProvider, api: GridApi): () => void {
  pushGroups(provider, api);
  const onChange = () => pushGroups(provider, api);
  api.addEventListener('columnRowGroupChanged', onChange);
  api.addEventListener('columnValueChanged', onChange);
  return () => {
    api.removeEventListener('columnRowGroupChanged', onChange);
    api.removeEventListener('columnValueChanged', onChange);
  };
}
