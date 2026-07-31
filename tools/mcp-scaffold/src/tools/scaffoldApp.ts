import { z } from 'zod';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTemplate, listTemplates } from '../lib/templateCatalog.js';
import {
  buildPackageDeps,
  copyTree,
  readManifest,
  resolveTarballs,
} from '../lib/tarballResolver.js';
import {
  composeTemplate,
  loadTemplateManifest,
  validateComposedDesign,
} from '../lib/fragmentComposer.js';
import { mergeGridFeatures } from '../resources/gridFeatureCatalog.js';
import { consumerScriptsSourceDir, stompServerSourceDir } from '../lib/paths.js';

const scaffoldSchema = z.object({
  template: z.enum(['basic', 'mockdata-provider', 'dataprovider-editor', 'stomp', 'openfin-platform']),
  appName: z.string().regex(/^[a-z][a-z0-9-]*$/),
  outputDir: z.string(),
  port: z.number().int().min(1024).max(65535).optional(),
  gridFeatures: z.record(z.unknown()).optional(),
  staruiRoot: z.string().optional(),
  includeUiRecipes: z.array(z.string()).optional(),
  force: z.boolean().optional(),
});

export type ScaffoldInput = z.infer<typeof scaffoldSchema>;

export interface ScaffoldResult {
  success: boolean;
  outputPath: string;
  template: string;
  devCommand: string;
  stompCommand?: string;
  openfinCommand?: string;
  warnings: string[];
  violations?: Array<{ rule: string; path: string; message: string }>;
}

export async function scaffoldApp(raw: ScaffoldInput): Promise<ScaffoldResult> {
  const input = scaffoldSchema.parse(raw);
  const template = getTemplate(input.template);
  if (!template) throw new Error(`Unknown template: ${input.template}`);

  const outputPath = join(input.outputDir, input.appName);
  if (existsSync(outputPath) && !input.force) {
    throw new Error(`Output directory already exists: ${outputPath}. Pass force: true to overwrite.`);
  }
  mkdirSync(outputPath, { recursive: true });

  const staruiRoot = input.staruiRoot ?? process.env.STARUI_ROOT;
  const tarballSource = process.env.STARUI_TARBALL_SOURCE;

  const bundle = await resolveTarballs({
    outputLibsDir: join(outputPath, 'libs'),
    buckets: template.buckets,
    staruiRoot,
    tarballSource,
  });

  const manifest = readManifest(bundle.manifestPath);
  const tarballDeps = buildPackageDeps(manifest, template.buckets);
  const port = input.port ?? template.defaultPort;
  const gridFeatures = mergeGridFeatures(input.template, input.gridFeatures);
  const packageName = `@wellsfargo-starui/${input.appName}`;

  const gridPropsLines: string[] = [];
  if (gridFeatures.showFiltersToolbar) gridPropsLines.push('showFiltersToolbar');
  if (gridFeatures.showFormattingToolbar) gridPropsLines.push('showFormattingToolbar');
  if (gridFeatures.showProfileSelector) gridPropsLines.push('showProfileSelector');
  if (gridFeatures.showSaveButton) gridPropsLines.push('showSaveButton');
  if (gridFeatures.showSettingsButton) gridPropsLines.push('showSettingsButton');
  if (gridFeatures.showVisualExcelExport) gridPropsLines.push('showVisualExcelExport');
  if (gridFeatures.showEditingToolbar) gridPropsLines.push('showEditingToolbar');
  if (gridFeatures.withStorage && input.template !== 'basic') gridPropsLines.push('withStorage');
  if (gridFeatures.sideBar) {
    gridPropsLines.push("sideBar={{ toolPanels: ['columns', 'filters'] }}");
  }
  if (gridFeatures.statusBar) {
    gridPropsLines.push(`statusBar={{
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
              ],
            }}`);
  }

  const manifestFile = loadTemplateManifest(input.template);
  const composeResult = composeTemplate(manifestFile, outputPath, {
    appName: input.appName,
    appId: input.appName,
    bootstrapErrorTitle: `${input.appName} — data services unavailable`,
    packageName,
    port,
    worker: template.worker,
    includesStompServer: template.includesStompServer,
    includesOpenFin: template.includesOpenFin,
    gridFeatures,
    gridPropsLines,
    tarballDeps,
    userId: 'dev1',
    gridId: `${input.appName}-grid`,
  });

  // Consumer Vite helper scripts (external apps cannot import monorepo scripts/)
  const scriptsSrc = consumerScriptsSourceDir(staruiRoot);
  const scriptsDest = join(outputPath, 'scripts');
  if (existsSync(scriptsSrc)) {
    mkdirSync(scriptsDest, { recursive: true });
    for (const file of ['staruiConsumerVite.mjs', 'staruiConsumerAliases.mjs', 'staruiTailwindContent.cjs']) {
      const src = join(scriptsSrc, file);
      if (existsSync(src)) copyFileSync(src, join(scriptsDest, file));
    }
  }

  if (template.includesStompServer) {
    const stompSrc = stompServerSourceDir(staruiRoot);
    if (stompSrc && existsSync(stompSrc)) {
      copyTree(stompSrc, join(outputPath, 'stomp-view-server'));
    } else {
      bundle.warnings.push('stomp-view-server source not found — copy manually from starui/apps/demos/stomp-view-server');
    }
  }

  const violations = validateComposedDesign(composeResult.files);
  if (violations.length > 0 && !input.force) {
    return {
      success: false,
      outputPath,
      template: input.template,
      devCommand: `cd ${outputPath} && npm ci && npm run dev`,
      warnings: bundle.warnings,
      violations,
    };
  }

  return {
    success: true,
    outputPath,
    template: input.template,
    devCommand: `cd ${outputPath} && npm ci && npm run dev`,
    stompCommand: template.includesStompServer
      ? `cd ${outputPath}/stomp-view-server && npm ci && npm run dev`
      : undefined,
    openfinCommand: template.includesOpenFin
      ? `cd ${outputPath} && npm run client`
      : undefined,
    warnings: [...bundle.warnings, ...violations.map((v) => `${v.path}: ${v.message}`)],
  };
}

export { listTemplates };
