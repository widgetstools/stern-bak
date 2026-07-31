import {
  GRID_FEATURE_DOCS,
  GRID_MODULES,
  USE_CASE_GRID_PRESETS,
} from '../../knowledge/platform.js';
import { GRID_FEATURE_CATALOG, defaultGridFeatures, mergeGridFeatures } from '../../resources/gridFeatureCatalog.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { templatesDir } from '../../lib/paths.js';

export function handleExplainGridFeature(featureKey: string) {
  const doc = GRID_FEATURE_DOCS[featureKey];
  const catalog = GRID_FEATURE_CATALOG.find((f) => f.key === featureKey);
  if (!doc && !catalog) {
    return { error: `Unknown feature: ${featureKey}`, available: GRID_FEATURE_CATALOG.map((f) => f.key) };
  }
  return { featureKey, catalog, documentation: doc };
}

export function handleSuggestGridFeatures(useCase: string, templateId?: string) {
  const preset = USE_CASE_GRID_PRESETS[useCase];
  if (!preset) {
    return {
      error: `Unknown use case: ${useCase}`,
      available: Object.keys(USE_CASE_GRID_PRESETS),
    };
  }
  const base = templateId ? defaultGridFeatures(templateId) : {};
  return { useCase, suggested: mergeGridFeatures(templateId ?? 'basic', { ...base, ...preset }) };
}

export function handleAddGridModule(opts: { projectDir: string; moduleId: string }) {
  const mod = GRID_MODULES.find((m) => m.id === opts.moduleId);
  if (!mod) {
    return { error: 'Unknown module', available: GRID_MODULES.map((m) => m.id) };
  }
  const snippetPath = join(opts.projectDir, 'src', 'gridModules.ts');
  const snippet = `/**
 * Optional MarketsGrid customizer modules — import into MarketsGrid \`modules\` prop.
 * Default MarketsGrid already includes DEFAULT_MODULES; override only when trimming.
 */
export const optionalModule = '${mod.id}';
// See packages/react-grid/grid/src/widget/MarketsGrid.tsx DEFAULT_MODULES for full list.
`;
  mkdirSync(dirname(snippetPath), { recursive: true });
  writeFileSync(snippetPath, snippet, 'utf8');
  return { written: snippetPath, module: mod, note: 'Pass modules={[...DEFAULT_MODULES]} or subset to MarketsGrid' };
}

function inferType(value: unknown): string {
  if (typeof value === 'number') return 'numericColumn';
  if (typeof value === 'boolean') return undefined as unknown as string;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'dateColumn';
  return undefined as unknown as string;
}

export function handleGenerateColumnDefs(opts: {
  sampleRows: Record<string, unknown>[];
  rowIdField?: string;
}) {
  if (!opts.sampleRows.length) return { error: 'Provide at least one sample row' };
  const keys = Object.keys(opts.sampleRows[0]);
  const columnDefs = keys.map((field) => {
    const sample = opts.sampleRows.find((r) => r[field] != null)?.[field];
    const type = inferType(sample);
    return {
      field,
      headerName: field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
      filter: true,
      sortable: true,
      ...(type ? { type } : {}),
    };
  });
  let rowIdField = opts.rowIdField;
  if (!rowIdField) {
    rowIdField = keys.find((k) => /id$/i.test(k) || k === 'id') ?? keys[0];
  }
  return { columnDefs, rowIdField, defaultColDef: { floatingFilter: true, resizable: true } };
}
