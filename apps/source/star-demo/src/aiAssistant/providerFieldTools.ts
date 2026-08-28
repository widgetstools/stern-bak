/**
 * Offering fields as choices, and acting on the choice.
 *
 * `describe_data_fields` could already list what a feed produces, but a flat
 * list of 256 names is not something a person picks from — and there was no way
 * to then say "use these twelve". These three tools close that loop:
 *
 *   list_mock_datasets   — what the mock provider can generate, as options
 *   list_provider_fields — a provider's fields, grouped, with the curated set
 *                          marked, rendered as a picker in the transcript
 *   set_provider_columns — apply a chosen set (or the curated default)
 *
 * The grouped payload is what the transcript renders as a field picker; the
 * model gets the same content as text so it can summarise or recommend.
 */
import {
  MOCK_DATASETS,
  mockDataset,
  mockFieldGroups,
  curatedColumns,
  allCatalogColumns,
  columnsForFields,
  type MockDataType,
} from '@wellsfargo-starui/data';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { LOGGED_IN_USER_ID, type ColumnDefinition, type ProviderConfig } from '@wellsfargo-starui/types';
import { reloadBlottersUsingProvider } from './blotterTools';
import { describeReload } from './launchComponent';
import type { ToolExecutionResult } from './toolResult';
import {
  probeAndInferFields,
  suggestedColumns,
  columnsForPaths,
  buildColumnDefinitions,
  type InferredField,
} from './providerColumns';

/** Marker the transcript keys on to render a field picker. */
export const FIELD_CELL = 'field-cell' as const;

export interface FieldCellPayload {
  kind: typeof FIELD_CELL;
  title: string;
  subtitle: string;
  /** Field names currently on the provider, so the picker can show state. */
  selected: string[];
  groups: Array<{
    group: string;
    fields: Array<{ field: string; headerName: string; cellDataType: string; curated: boolean }>;
  }>;
}

export function listMockDatasets(): ToolExecutionResult {
  return {
    ok: true,
    summary: MOCK_DATASETS.map((d) => `${d.dataType} (${d.fields.length} fields, ${d.fields.filter((f) => f.curated).length} curated)`).join(', '),
    data: {
      datasets: MOCK_DATASETS.map((d) => ({
        dataType: d.dataType,
        label: d.label,
        description: d.description,
        keyColumn: d.keyColumn,
        defaultRowCount: d.defaultRowCount,
        totalFields: d.fields.length,
        curatedFields: d.fields.filter((f) => f.curated).length,
        groups: [...new Set(d.fields.map((f) => f.group))],
      })),
      hint:
        'These are the shapes a mock provider can generate. A new one opens with the curated columns for its ' +
        'dataType — call list_provider_fields to show the full catalogue as a picker.',
    },
  };
}

function resolveDataType(config: unknown): MockDataType | undefined {
  const c = config as { providerType?: string; dataType?: MockDataType } | undefined;
  return c?.providerType === 'mock' ? c.dataType ?? 'positions' : undefined;
}

export async function listProviderFields(
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const providerId = args.providerId as string | undefined;
  const dataTypeArg = args.dataType as MockDataType | undefined;

  let title: string;
  let dataType: MockDataType | undefined;
  let selected: string[] = [];

  if (providerId) {
    const provider = await configStore.get(providerId);
    if (!provider) return { ok: false, summary: `No data provider with id "${providerId}". Call list_data_providers.` };
    dataType = resolveDataType(provider.config);
    if (!dataType) {
      const saved = ((provider.config as { columnDefinitions?: ColumnDefinition[] })?.columnDefinitions) ?? [];
      if (saved.length === 0) {
        return {
          ok: false,
          summary:
            `"${provider.name}" is a ${(provider.config as { providerType?: string })?.providerType ?? 'non-mock'} feed with no saved ` +
            'columnDefinitions, so there is no catalogue to show. Probe it in the Data Provider Editor first, ' +
            'or pass its fields explicitly to set_provider_columns.',
        };
      }
      // A probed STOMP/REST feed: its saved columns ARE its catalogue.
      return {
        ok: true,
        summary: `${saved.length} saved field(s) on "${provider.name}".`,
        data: {
          kind: FIELD_CELL,
          title: provider.name,
          subtitle: `${saved.length} saved fields · probed feed`,
          selected: saved.map((c) => c.field),
          groups: [
            {
              group: 'Saved columns',
              fields: saved.map((c) => ({
                field: c.field,
                headerName: c.headerName ?? c.field,
                cellDataType: c.cellDataType ?? 'text',
                curated: true,
              })),
            },
          ],
        } satisfies FieldCellPayload,
      };
    }
    title = provider.name;
    selected = (((provider.config as { columnDefinitions?: ColumnDefinition[] })?.columnDefinitions) ?? []).map((c) => c.field);
  } else if (dataTypeArg) {
    dataType = dataTypeArg;
    title = mockDataset(dataType).label;
    selected = curatedColumns(dataType).map((c) => c.field);
  } else {
    return { ok: false, summary: 'Pass a providerId, or a dataType to browse the mock catalogue.' };
  }

  const spec = mockDataset(dataType);
  const payload: FieldCellPayload = {
    kind: FIELD_CELL,
    title,
    subtitle: `${spec.label} · ${spec.fields.length} fields · ${selected.length} selected`,
    selected,
    groups: mockFieldGroups(dataType).map((g) => ({
      group: g.group,
      fields: g.fields.map((f) => ({
        field: f.field,
        headerName: f.headerName,
        cellDataType: f.cellDataType,
        curated: f.curated === true,
      })),
    })),
  };

  return {
    ok: true,
    summary:
      `${spec.fields.length} fields in ${payload.groups.length} groups for ${spec.label}; ` +
      `${selected.length} currently selected. Groups: ${payload.groups.map((g) => `${g.group} (${g.fields.length})`).join(', ')}.`,
    data: payload,
  };
}

/** Provider types no probe transport exists for yet — matches the same gap `useProviderProbe.probeOnce` has in the Data Provider Editor. */
const UNPROBEABLE_TYPES = new Set(['websocket', 'socketio']);

/**
 * Probes a live stomp/rest feed and shows what it actually carries — the
 * assistant's equivalent of the Data Provider Editor's "Probe → Fields"
 * button, which used to be a manual, UI-only step (see `create_data_provider`'s
 * schema and `systemPrompt.ts`'s old "STOMP and REST feeds can't be probed
 * from here" line). Read-only: nothing is saved until `set_provider_columns`
 * is called next, same two-step shape as the mock catalogue flow above.
 */
export async function inferProviderFields(
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const providerId = args.providerId as string | undefined;
  if (!providerId) return { ok: false, summary: 'Missing required field: providerId.' };
  const provider = await configStore.get(providerId);
  if (!provider) return { ok: false, summary: `No data provider with id "${providerId}". Call list_data_providers.` };

  const config = provider.config as ProviderConfig;
  if (config.providerType === 'mock') {
    return { ok: false, summary: 'Mock providers already have a curated field catalogue — call list_provider_fields instead of probing.' };
  }
  if (config.providerType === 'appdata') {
    return { ok: false, summary: 'AppData is key/value app state, not a row feed — there is nothing to infer.' };
  }
  if (UNPROBEABLE_TYPES.has(config.providerType)) {
    return { ok: false, summary: `Field inference isn't available for ${config.providerType} feeds yet — probing isn't implemented for that transport.` };
  }

  const sampleSize = args.sampleSize as number | undefined;
  const probed = await probeAndInferFields(config, { sampleSize });
  if (!probed.ok) {
    return {
      ok: false,
      summary: `Could not probe "${provider.name}": ${probed.error}. Check the URL/topic and that the feed is reachable from this network.`,
    };
  }

  const all = buildColumnDefinitions(probed.fields);
  const suggested = suggestedColumns(probed.fields, { maxColumns: 40 });
  const suggestedNames = new Set(suggested.map((c) => c.field));

  const payload: FieldCellPayload = {
    kind: FIELD_CELL,
    title: provider.name,
    subtitle:
      `${all.length} field(s) inferred from ${probed.rowsUsed} sampled row(s) (of ${probed.rowsFetched} fetched) · ` +
      `${suggested.length} suggested — nothing saved yet`,
    selected: [...suggestedNames],
    groups: [
      {
        group: 'Inferred fields',
        fields: all.map((c) => ({
          field: c.field,
          headerName: c.headerName ?? c.field,
          cellDataType: c.cellDataType ?? 'text',
          curated: suggestedNames.has(c.field),
        })),
      },
    ],
  };

  return {
    ok: true,
    summary:
      `${all.length} fields on "${provider.name}", ${suggested.length} suggested (shallow fields first, capped at 40). ` +
      'Call set_provider_columns with preset: "curated" to apply the suggestion, "all" for every field, or fields to name an exact set.',
    data: payload,
  };
}

type ColumnSelection =
  | { ok: true; next: ColumnDefinition[]; what: string; probedFields?: InferredField[] }
  | { ok: false; summary: string };

/**
 * The stomp/rest counterpart of the mock preset/fields/add/remove dispatch
 * below — same argument shapes, resolved against a live probe instead of a
 * static catalogue (there isn't one for an arbitrary feed). `remove` alone
 * needs no probe at all — it only ever drops names already in `existing`.
 */
async function resolveProbedSelection(
  config: ProviderConfig,
  existing: ColumnDefinition[],
  opts: { preset?: 'curated' | 'all'; fields?: string[]; add?: string[]; remove?: string[] },
  providerName: string,
): Promise<ColumnSelection> {
  const { preset, fields, add, remove } = opts;
  let inferred: InferredField[] | undefined;
  if (preset || fields || add?.length) {
    const probed = await probeAndInferFields(config, {});
    if (!probed.ok) {
      return { ok: false, summary: `Could not probe "${providerName}": ${probed.error}. Check the URL/topic and that the feed is reachable from this network.` };
    }
    inferred = probed.fields;
  }

  if (preset) {
    const next = preset === 'curated' ? suggestedColumns(inferred!, { maxColumns: 40 }) : buildColumnDefinitions(inferred!);
    return { ok: true, next, what: `${preset} set (${next.length} columns)`, probedFields: inferred };
  }
  if (fields) {
    const resolved = columnsForPaths(inferred!, fields);
    if (resolved.unknown.length > 0) {
      return {
        ok: false,
        summary: `Not found among the inferred fields: ${resolved.unknown.join(', ')}. Call infer_provider_fields to see the valid names.`,
      };
    }
    return { ok: true, next: resolved.columns, what: `${resolved.columns.length} chosen column(s)`, probedFields: inferred };
  }

  const byName = new Map(existing.map((c) => [c.field, c]));
  for (const name of remove ?? []) byName.delete(name);
  if (add?.length) {
    const resolved = columnsForPaths(inferred!, add);
    if (resolved.unknown.length > 0) {
      return { ok: false, summary: `Not found among the inferred fields: ${resolved.unknown.join(', ')}.` };
    }
    for (const col of resolved.columns) byName.set(col.field, col);
  }
  const next = [...byName.values()];
  const what = `${add?.length ? `added ${add.length}` : ''}${add?.length && remove?.length ? ', ' : ''}${remove?.length ? `removed ${remove.length}` : ''} (${next.length} total)`;
  return { ok: true, next, what, probedFields: inferred };
}

export async function setProviderColumns(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const providerId = args.providerId as string | undefined;
  if (!providerId) return { ok: false, summary: 'Missing required field: providerId.' };
  const provider = await configStore.get(providerId);
  if (!provider) return { ok: false, summary: `No data provider with id "${providerId}". Call list_data_providers.` };

  const preset = args.preset as 'curated' | 'all' | undefined;
  const fields = args.fields as string[] | undefined;
  const add = args.add as string[] | undefined;
  const remove = args.remove as string[] | undefined;

  if (!preset && !fields && !add && !remove) {
    return { ok: false, summary: 'Nothing to change — pass preset ("curated" | "all"), fields, add or remove.' };
  }

  const config = provider.config as ProviderConfig & { columnDefinitions?: ColumnDefinition[]; keyColumn?: string };
  const existing = config.columnDefinitions ?? [];
  const dataType = resolveDataType(config);
  const canProbe = !dataType && (config.providerType === 'stomp' || config.providerType === 'rest');

  let next: ColumnDefinition[];
  let what: string;
  let probedFields: InferredField[] | undefined;

  if (dataType) {
    if (preset === 'curated' || preset === 'all') {
      next = preset === 'curated' ? curatedColumns(dataType) : allCatalogColumns(dataType);
      what = `${preset} set (${next.length} columns)`;
    } else if (fields) {
      const resolved = columnsForFields(dataType, fields);
      if (resolved.unknown.length > 0) {
        return {
          ok: false,
          summary:
            `Not in the ${dataType} catalogue: ${resolved.unknown.join(', ')}. ` +
            'Call list_provider_fields to see the valid names.',
        };
      }
      next = resolved.columns;
      what = `${next.length} chosen column(s)`;
    } else {
      const byName = new Map(existing.map((c) => [c.field, c]));
      for (const name of remove ?? []) byName.delete(name);
      if (add?.length) {
        const resolved = columnsForFields(dataType, add);
        if (resolved.unknown.length > 0) {
          return { ok: false, summary: `Not in the ${dataType} catalogue: ${resolved.unknown.join(', ')}.` };
        }
        for (const col of resolved.columns) byName.set(col.field, col);
      }
      next = [...byName.values()];
      what = `${add?.length ? `added ${add.length}` : ''}${add?.length && remove?.length ? ', ' : ''}${remove?.length ? `removed ${remove.length}` : ''} (${next.length} total)`;
    }
  } else if (canProbe) {
    const selection = await resolveProbedSelection(config, existing, { preset, fields, add, remove }, provider.name);
    if (!selection.ok) return selection;
    next = selection.next;
    what = selection.what;
    probedFields = selection.probedFields;
  } else {
    return {
      ok: false,
      summary: `Field selection needs either a mock catalogue or a probeable (stomp/rest) feed. "${provider.name}" is neither.`,
    };
  }

  if (next.length === 0) {
    return { ok: false, summary: 'That would leave the provider with no columns, which renders an empty grid. Keep at least one.' };
  }

  const keyColumn = config.keyColumn ?? (dataType ? mockDataset(dataType).keyColumn : undefined);
  // The hub keys its row cache by keyColumn and silently drops rows that don't
  // resolve one — dropping that column is how a grid ends up mysteriously empty.
  // Added back HIDDEN: it has to be present for the hub to key on, but row
  // identity ("91282CAB7-0") is plumbing, not something a trader reads. For a
  // probed provider this only needs ANOTHER probe if one hasn't already
  // happened this call (`probedFields`) — a bare fallback column still lets
  // the hub key on it otherwise, matching a pure `remove` needing no probe.
  const keyColumnDef = (): ColumnDefinition[] => {
    if (dataType) return columnsForFields(dataType, [keyColumn!]).columns;
    if (probedFields) return columnsForPaths(probedFields, [keyColumn!]).columns;
    return [{ field: keyColumn!, headerName: keyColumn!, filter: true, sortable: true, resizable: true }];
  };
  const withKey =
    keyColumn && !next.some((c) => c.field === keyColumn)
      ? [...keyColumnDef().map((c) => ({ ...c, hide: true })), ...next]
      : next;

  await configStore.save(
    {
      ...provider,
      config: { ...config, columnDefinitions: withKey, ...(keyColumn ? { keyColumn } : null) },
    } as Parameters<DataProviderConfigStore['save']>[0],
    LOGGED_IN_USER_ID,
  );

  const restored = withKey.length !== next.length ? ` (kept "${keyColumn}" — the feed is keyed on it)` : '';
  // A provider's columns are read when a grid's container mounts, so this is
  // one of the few changes that can't be re-applied live — reload the windows
  // already showing it rather than telling the user to reopen them.
  const reloaded = await reloadBlottersUsingProvider(configManager, providerId);
  return {
    ok: true,
    summary: `"${provider.name}" now shows ${what}${restored}.` + describeReload(reloaded),
    data: { columns: withKey.map((c) => c.field), keyColumn },
  };
}
