import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildColumnCustomizationModule,
  buildSmartEditModule,
  CONFIGURABLE_RENDERER_IDS,
  DEFAULT_LAYOUT_PACK_FILES,
  defaultPillRendererConfig,
  LAYOUT_MODULE_SCHEMA_VERSIONS,
  type LayoutExportPayload,
} from '../../knowledge/layout.js';
import { gridConfigLayoutsSource, templatesDir } from '../../lib/paths.js';

export interface GenerateLayoutInput {
  gridId: string;
  layoutName: string;
  columnRenderers?: Array<{ colId: string; rendererId: string }>;
  enableSmartEdit?: boolean;
  enableToolbarVisibility?: boolean;
}

function buildRendererAssignment(colId: string, rendererId: string) {
  const kind = rendererId as (typeof CONFIGURABLE_RENDERER_IDS)[number];
  let cellRendererConfig: Record<string, unknown> = { kind: rendererId, config: {} };

  if (rendererId === 'pill') {
    cellRendererConfig = defaultPillRendererConfig(colId);
  } else if (rendererId === 'heatmap') {
    cellRendererConfig = {
      kind: 'heatmap',
      config: {
        min: 0,
        max: 100,
        colorLow: { dark: '#1e3a5f', light: '#dbeafe' },
        colorHigh: { dark: '#dc2626', light: '#fecaca' },
      },
    };
  }

  return {
    colId,
    cellRendererId: rendererId,
    cellRendererConfig,
  };
}

export function handleGenerateLayout(input: GenerateLayoutInput): {
  layout: LayoutExportPayload;
  fileName: string;
  importHint: string;
} {
  const state: LayoutExportPayload['profile']['state'] = {};

  if (input.columnRenderers?.length) {
    const assignments: Record<string, unknown> = {};
    for (const { colId, rendererId } of input.columnRenderers) {
      if (!CONFIGURABLE_RENDERER_IDS.includes(rendererId as (typeof CONFIGURABLE_RENDERER_IDS)[number])) {
        throw new Error(
          `Unknown renderer "${rendererId}". Use: ${CONFIGURABLE_RENDERER_IDS.join(', ')}`,
        );
      }
      assignments[colId] = buildRendererAssignment(colId, rendererId);
    }
    state['column-customization'] = buildColumnCustomizationModule(assignments);
  }

  if (input.enableSmartEdit) {
    state['smart-edit'] = buildSmartEditModule(true);
  }

  if (input.enableToolbarVisibility) {
    state['toolbar-visibility'] = {
      v: LAYOUT_MODULE_SCHEMA_VERSIONS['toolbar-visibility'],
      data: {
        showFiltersToolbar: true,
        showFormattingToolbar: true,
        showEditingToolbar: Boolean(input.enableSmartEdit),
      },
    };
  }

  const layout: LayoutExportPayload = {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: {
      name: input.layoutName,
      gridId: input.gridId,
      state,
    },
  };

  const slug = input.layoutName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = `${slug || 'layout'}.layout.json`;

  return {
    layout,
    fileName,
    importHint:
      `Write to config/layouts/${fileName}, then import via MarketsGrid layout selector (Profile → Import). gridId must match HostedMarketsGrid.`,
  };
}

export function handleValidateLayout(raw: unknown) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Payload is not an object'], warnings: [] };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.kind !== 'gc-profile') errors.push('kind must be "gc-profile" (layout wire format)');
  if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion < 1) {
    errors.push('schemaVersion must be >= 1');
  }

  const profile = obj.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    errors.push('Missing profile body');
    return { valid: false, errors, warnings };
  }
  if (typeof profile.name !== 'string' || !profile.name.trim()) errors.push('profile.name required');
  if (typeof profile.gridId !== 'string' || !profile.gridId.trim()) errors.push('profile.gridId required');

  const state = profile.state as Record<string, { v?: number; data?: unknown }> | undefined;
  if (!state || typeof state !== 'object') {
    errors.push('profile.state required');
    return { valid: false, errors, warnings };
  }

  for (const [moduleId, slice] of Object.entries(state)) {
    const expected = LAYOUT_MODULE_SCHEMA_VERSIONS[moduleId];
    if (expected == null) {
      warnings.push(`Unknown module id "${moduleId}" — may still load if registered in grid`);
      continue;
    }
    if (slice?.v != null && slice.v !== expected) {
      warnings.push(
        `Module "${moduleId}" has v=${slice.v}; current platform version is ${expected} (migrate on import)`,
      );
    }

    if (moduleId === 'column-customization') {
      const data = slice?.data as { assignments?: Record<string, unknown> } | undefined;
      const assignments = data?.assignments ?? {};
      for (const [colId, assignment] of Object.entries(assignments)) {
        const a = assignment as { cellRendererId?: string };
        if (a.cellRendererId && !CONFIGURABLE_RENDERER_IDS.includes(a.cellRendererId as never)) {
          warnings.push(`Column "${colId}": unknown cellRendererId "${a.cellRendererId}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    gridId: profile.gridId,
    layoutName: profile.name,
    moduleIds: Object.keys(state),
    note: 'Valid layout JSON can be imported via the grid layout selector; internally stored as a profile snapshot.',
  };
}

export function handleLayoutRecipe(opts: { gridId: string; dataType: string }) {
  return {
    gridId: opts.gridId,
    layouts: [
      {
        name: `${opts.dataType} default layout`,
        storageScope: `(appId, userId, instanceId)`,
        configRowType: 'markets-grid-profile-set',
      },
    ],
    configDir: 'config/layouts/',
    storageKey: `markets-grid-profile-set:${opts.gridId}`,
    note: 'Layouts persist via ConfigManager profile-set bundle or localStorage when withStorage is enabled.',
    generateTool: 'starui_generate_layout',
    importTool: 'starui_import_layout_pack',
  };
}

function resolveLayoutPackSource(staruiRoot?: string): string | null {
  const fromMonorepo = gridConfigLayoutsSource(staruiRoot);
  if (fromMonorepo) return fromMonorepo;
  const bundled = join(templatesDir(), 'resources', 'layout-packs');
  return existsSync(bundled) ? bundled : null;
}

export function handleImportLayoutPack(opts: {
  projectDir: string;
  pack?: 'starter' | 'all';
  staruiRoot?: string;
  fileNames?: string[];
}) {
  const source = resolveLayoutPackSource(opts.staruiRoot);
  if (!source) {
    return {
      error: 'No layout pack source found. Set STARUI_ROOT or scaffold from monorepo.',
    };
  }

  const dest = join(opts.projectDir, 'config', 'layouts');
  mkdirSync(dest, { recursive: true });

  let files: string[];
  if (opts.fileNames?.length) {
    files = opts.fileNames;
  } else if (opts.pack === 'all') {
    files = readdirSync(source).filter((f) => f.endsWith('.profile.json') || f.endsWith('.layout.json'));
  } else {
    files = [...DEFAULT_LAYOUT_PACK_FILES];
  }

  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    let srcPath = join(source, file);
    if (!existsSync(srcPath) && file.endsWith('.layout.json')) {
      srcPath = join(source, file.replace('.layout.json', '.profile.json'));
    } else if (!existsSync(srcPath) && file.endsWith('.profile.json')) {
      srcPath = join(source, file.replace('.profile.json', '.layout.json'));
    }
    if (!existsSync(srcPath)) {
      skipped.push(file);
      continue;
    }
    const outName = file.endsWith('.profile.json')
      ? file.replace(/\.profile\.json$/, '.layout.json')
      : file.endsWith('.layout.json')
        ? file
        : `${file}.layout.json`;
    const destPath = join(dest, outName);
    cpSync(srcPath, destPath);
    written.push(`config/layouts/${outName}`);
  }

  const readmePath = join(opts.projectDir, 'config', 'layouts', 'README.md');
  if (!existsSync(readmePath)) {
    writeFileSync(
      readmePath,
      `# Grid layouts

Import any \`.layout.json\` via the MarketsGrid **layout selector → Import**.

Files use wire format \`kind: gc-profile\`. \`profile.gridId\` must match your \`HostedMarketsGrid\` / \`MarketsGrid\` \`gridId\`.

Generate new layouts: \`starui_generate_layout\`
Validate before commit: \`starui_validate_layout\`
`,
      'utf8',
    );
    written.push('config/layouts/README.md');
  }

  return {
    source,
    written,
    skipped,
    next: 'Import a layout from the grid toolbar, or load programmatically via ProfileManager.import()',
  };
}

export function handleWriteLayoutToProject(opts: {
  projectDir: string;
  layout: LayoutExportPayload;
  fileName?: string;
}) {
  const slug = opts.layout.profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = opts.fileName ?? `${slug || 'layout'}.layout.json`;
  const dest = join(opts.projectDir, 'config', 'layouts', fileName);
  mkdirSync(join(opts.projectDir, 'config', 'layouts'), { recursive: true });
  writeFileSync(dest, JSON.stringify(opts.layout, null, 2), 'utf8');
  return { written: dest, fileName };
}

export function handleExplainLayoutModule(moduleId: string) {
  const schemaVersion = LAYOUT_MODULE_SCHEMA_VERSIONS[moduleId];
  if (schemaVersion == null) {
    return {
      error: `Unknown module: ${moduleId}`,
      available: Object.keys(LAYOUT_MODULE_SCHEMA_VERSIONS),
    };
  }
  return {
    moduleId,
    schemaVersion,
    stateKey: `profile.state["${moduleId}"]`,
    userTerm: 'layout module slice',
    docs: 'See packages/react-grid/grid/src/customizer/modules/' + moduleId.replace(/-/g, '-'),
  };
}
