import { handleListTemplates } from './listTemplates.js';
import { handleListGridFeatures } from './listGridFeatures.js';
import { handleListUiComponents } from './listUiComponents.js';
import { scaffoldApp } from './scaffoldApp.js';
import { handleAddUiComponent } from './addUiComponent.js';
import { handleValidateScaffold } from './validateScaffold.js';
import { handleValidateDesignCompliance } from './validateDesignCompliance.js';
import { handlePrintInstallConfig } from './printInstallConfig.js';
import {
  handleRecommendTemplate,
  handleSetupStompDev,
  handleDiagnoseDataPlane,
  handleUpgradeScaffold,
} from './platform/workflow.js';
import {
  handleExplainGridFeature,
  handleSuggestGridFeatures,
  handleAddGridModule,
  handleGenerateColumnDefs,
} from './platform/grid.js';
import {
  handleGenerateLayout,
  handleValidateLayout,
  handleImportLayoutPack,
  handleLayoutRecipe,
  handleWriteLayoutToProject,
  handleExplainLayoutModule,
} from './platform/layout.js';
import { handleConfigOrCode } from './platform/configOrCode.js';
import {
  handleListProviderTypes,
  handleGenerateStompConfig,
  handleValidateProviderConfig,
  handleAddProviderToProject,
  handleTestStompConnection,
  handleExplainProviderToolbar,
  handleProviderConfigFromCsv,
} from './platform/provider.js';
import {
  handleCheckTarballVersions,
  handleRefreshLibs,
  handleExplainImportAlias,
  handleBucketDependencyGraph,
} from './platform/tarball.js';
import {
  handleExplainComponentRegistration,
  handleAddBlotterRoute,
  handleGenerateViewManifest,
  handleOpenfinLaunchChecklist,
} from './platform/openfin.js';
import {
  handleAuditAppDesign,
  handleAddShellLayout,
  handleThemePlaygroundSnippet,
  handleShadcnComponentPicker,
} from './platform/design.js';
import {
  handleSmokeTestApp,
  handleValidateStompE2e,
  handleSnapshotGridConfig,
} from './platform/testing.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const PLATFORM_TOOLS: ToolDefinition[] = [
  { name: 'starui_list_templates', description: 'List StarUI app scaffold templates', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_recommend_template', description: 'Recommend best template from requirements', inputSchema: { type: 'object', properties: { needsOpenFin: { type: 'boolean' }, needsLiveData: { type: 'boolean' }, needsProviderEditor: { type: 'boolean' }, needsStaticDemo: { type: 'boolean' }, needsMockOnly: { type: 'boolean' } } } },
  { name: 'starui_list_grid_features', description: 'List MarketsGrid feature toggles', inputSchema: { type: 'object', properties: { templateId: { type: 'string' } } } },
  { name: 'starui_explain_grid_feature', description: 'Explain a MarketsGrid feature flag', inputSchema: { type: 'object', properties: { featureKey: { type: 'string' } }, required: ['featureKey'] } },
  { name: 'starui_suggest_grid_features', description: 'Suggest grid features for a use case preset', inputSchema: { type: 'object', properties: { useCase: { type: 'string', enum: ['read-only-dashboard', 'trader-blotter', 'risk-analytics'] }, templateId: { type: 'string' } }, required: ['useCase'] } },
  { name: 'starui_add_grid_module', description: 'Add optional customizer module stub to project', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, moduleId: { type: 'string' } }, required: ['projectDir', 'moduleId'] } },
  { name: 'starui_generate_column_defs', description: 'Infer ColDef[] from sample JSON rows', inputSchema: { type: 'object', properties: { sampleRows: { type: 'array' }, rowIdField: { type: 'string' } }, required: ['sampleRows'] } },
  { name: 'starui_config_or_code', description: 'Decide layout JSON vs scaffold code for a feature', inputSchema: { type: 'object', properties: { feature: { type: 'string' }, hasOpenFin: { type: 'boolean' }, hasLiveData: { type: 'boolean' }, gridId: { type: 'string' } }, required: ['feature'] } },
  { name: 'starui_generate_layout', description: 'Generate importable grid layout JSON (gc-profile)', inputSchema: { type: 'object', properties: { gridId: { type: 'string' }, layoutName: { type: 'string' }, columnRenderers: { type: 'array', items: { type: 'object', properties: { colId: { type: 'string' }, rendererId: { type: 'string' } } } }, enableSmartEdit: { type: 'boolean' }, enableToolbarVisibility: { type: 'boolean' }, projectDir: { type: 'string' }, fileName: { type: 'string' } }, required: ['gridId', 'layoutName'] } },
  { name: 'starui_validate_layout', description: 'Validate layout JSON before import', inputSchema: { type: 'object', properties: { layout: { type: 'object' } }, required: ['layout'] } },
  { name: 'starui_import_layout_pack', description: 'Copy curated layout packs into config/layouts/', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, pack: { type: 'string', enum: ['starter', 'all'] }, staruiRoot: { type: 'string' }, fileNames: { type: 'array', items: { type: 'string' } } }, required: ['projectDir'] } },
  { name: 'starui_layout_recipe', description: 'Starter layout bundle recipe for a gridId', inputSchema: { type: 'object', properties: { gridId: { type: 'string' }, dataType: { type: 'string' } }, required: ['gridId', 'dataType'] } },
  { name: 'starui_explain_layout_module', description: 'Explain a customizer module schema in layouts', inputSchema: { type: 'object', properties: { moduleId: { type: 'string' } }, required: ['moduleId'] } },
  { name: 'starui_list_ui_components', description: 'List @wellsfargo-starui/ui shadcn exports and recipes', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_scaffold_app', description: 'Scaffold external-consumer StarUI React app', inputSchema: { type: 'object', properties: { template: { type: 'string', enum: ['basic', 'mockdata-provider', 'dataprovider-editor', 'stomp', 'openfin-platform'] }, appName: { type: 'string' }, outputDir: { type: 'string' }, port: { type: 'number' }, gridFeatures: { type: 'object' }, staruiRoot: { type: 'string' }, force: { type: 'boolean' } }, required: ['template', 'appName', 'outputDir'] } },
  { name: 'starui_upgrade_scaffold', description: 'Compare project files to template manifest', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, templateId: { type: 'string' } }, required: ['projectDir', 'templateId'] } },
  { name: 'starui_list_provider_types', description: 'STOMP / mock / REST / AppData provider guide', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_generate_stomp_config', description: 'Generate StompProviderConfig + ensureStompProvider snippet', inputSchema: { type: 'object', properties: { clientTag: { type: 'string' }, dataType: { type: 'string' }, websocketUrl: { type: 'string' }, port: { type: 'number' }, keyColumn: { type: 'string' }, name: { type: 'string' } } } },
  { name: 'starui_validate_provider_config', description: 'Validate provider config shape', inputSchema: { type: 'object', properties: { config: { type: 'object' } }, required: ['config'] } },
  { name: 'starui_add_provider_to_project', description: 'Add STOMP or mock provider files to existing app', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, providerType: { type: 'string', enum: ['stomp', 'mock'] }, clientTag: { type: 'string' } }, required: ['projectDir', 'providerType'] } },
  { name: 'starui_setup_stomp_dev', description: 'STOMP dev setup checklist + health check', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, stompPort: { type: 'number' }, websocketUrl: { type: 'string' } } } },
  { name: 'starui_test_stomp_connection', description: 'Probe stomp-view-server health and WebSocket', inputSchema: { type: 'object', properties: { websocketUrl: { type: 'string' }, port: { type: 'number' } } } },
  { name: 'starui_diagnose_data_plane', description: 'Diagnose empty grid / data plane issues', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, stompPort: { type: 'number' } }, required: ['projectDir'] } },
  { name: 'starui_explain_provider_toolbar', description: 'How to use the grid provider toolbar', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_provider_config_from_csv', description: 'Infer STOMP config columns from CSV header', inputSchema: { type: 'object', properties: { csvHeaderLine: { type: 'string' }, dataType: { type: 'string' } }, required: ['csvHeaderLine'] } },
  { name: 'starui_check_tarball_versions', description: 'Compare libs/ tarballs vs STARUI_ROOT', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, staruiRoot: { type: 'string' } }, required: ['projectDir'] } },
  { name: 'starui_refresh_libs', description: 'Refresh libs/ tarballs and package.json file: deps', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, staruiRoot: { type: 'string' } }, required: ['projectDir'] } },
  { name: 'starui_explain_import_alias', description: 'Explain @wellsfargo-starui import vs tarball dep mapping', inputSchema: { type: 'object', properties: { importPath: { type: 'string' } } } },
  { name: 'starui_bucket_dependency_graph', description: 'Architecture bucket dependency graph', inputSchema: { type: 'object', properties: { templateId: { type: 'string' } } } },
  { name: 'starui_explain_component_registration', description: 'OpenFin MarketsGrid route + component registration', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_add_blotter_route', description: 'Add HostedMarketsGrid blotter view file', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, routePath: { type: 'string' }, gridId: { type: 'string' }, componentName: { type: 'string' } }, required: ['projectDir', 'routePath', 'gridId', 'componentName'] } },
  { name: 'starui_generate_view_manifest', description: 'Generate OpenFin FDC3 view manifest JSON', inputSchema: { type: 'object', properties: { viewUrl: { type: 'string' }, title: { type: 'string' }, fdc3ContextGroup: { type: 'string' } }, required: ['viewUrl', 'title'] } },
  { name: 'starui_openfin_launch_checklist', description: 'Pre-flight checks before npm run client', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, port: { type: 'number' } }, required: ['projectDir'] } },
  { name: 'starui_add_ui_component', description: 'Add shadcn UI recipe to project', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, component: { type: 'string', enum: ['help-sheet', 'app-menubar', 'status-strip', 'theme-toggle'] }, targetPath: { type: 'string' } }, required: ['projectDir', 'component'] } },
  { name: 'starui_audit_app_design', description: 'Full design-system + shadcn audit', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } }, required: ['projectDir'] } },
  { name: 'starui_add_shell_layout', description: 'Add shell UI recipes (menubar, status, theme)', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, recipes: { type: 'array', items: { type: 'string' } } }, required: ['projectDir'] } },
  { name: 'starui_theme_playground_snippet', description: 'Theme toggle + AG Grid sync snippet', inputSchema: { type: 'object', properties: {} } },
  { name: 'starui_shadcn_component_picker', description: 'Pick @wellsfargo-starui/ui components from description', inputSchema: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } },
  { name: 'starui_validate_scaffold', description: 'npm ci + typecheck smoke', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, skipInstall: { type: 'boolean' } }, required: ['projectDir'] } },
  { name: 'starui_smoke_test_app', description: 'Extended scaffold smoke test', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, skipInstall: { type: 'boolean' } }, required: ['projectDir'] } },
  { name: 'starui_validate_design_compliance', description: 'Token + shadcn linter', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } }, required: ['projectDir'] } },
  { name: 'starui_validate_stomp_e2e', description: 'STOMP connection + data plane validation', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, stompPort: { type: 'number' } }, required: ['projectDir'] } },
  { name: 'starui_snapshot_grid_config', description: 'Hints for exporting grid layout config', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, gridId: { type: 'string' } }, required: ['projectDir', 'gridId'] } },
  { name: 'starui_print_install_config', description: 'MCP install JSON for IDEs', inputSchema: { type: 'object', properties: { staruiRoot: { type: 'string' }, tarballPath: { type: 'string' } } } },
];

export const PLATFORM_RESOURCES = [
  { uri: 'starui://design-rules', name: 'design-rules', mimeType: 'text/markdown', file: 'design-rules.md' },
  { uri: 'starui://guides/stomp-marketsgrid', name: 'stomp-marketsgrid', mimeType: 'text/markdown', file: 'guides/stomp-marketsgrid.md' },
  { uri: 'starui://guides/layout-persistence', name: 'layout-persistence', mimeType: 'text/markdown', file: 'guides/layout-persistence.md' },
  { uri: 'starui://guides/customizer-modules', name: 'customizer-modules', mimeType: 'text/markdown', file: 'guides/customizer-modules.md' },
  { uri: 'starui://guides/wire-stomp', name: 'wire-stomp', mimeType: 'text/markdown', file: 'guides/wire-stomp.md' },
  { uri: 'starui://recipes/provider-stomp-positions', name: 'provider-stomp-positions', mimeType: 'text/markdown', file: 'recipes/provider-stomp-positions.md' },
  { uri: 'starui://recipes/openfin-blotter-route', name: 'openfin-blotter-route', mimeType: 'text/markdown', file: 'recipes/openfin-blotter-route.md' },
  { uri: 'starui://troubleshooting/empty-grid', name: 'empty-grid', mimeType: 'text/markdown', file: 'guides/troubleshooting-empty-grid.md' },
  { uri: 'starui://troubleshooting/wire-stomp', name: 'wire-stomp-troubleshooting', mimeType: 'text/markdown', file: 'guides/wire-stomp.md' },
] as const;

export async function dispatchPlatformTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'starui_list_templates': return handleListTemplates();
    case 'starui_recommend_template': return handleRecommendTemplate(args as Parameters<typeof handleRecommendTemplate>[0]);
    case 'starui_list_grid_features': return handleListGridFeatures(args.templateId as string | undefined);
    case 'starui_explain_grid_feature': return handleExplainGridFeature(args.featureKey as string);
    case 'starui_suggest_grid_features': return handleSuggestGridFeatures(args.useCase as string, args.templateId as string | undefined);
    case 'starui_add_grid_module': return handleAddGridModule(args as Parameters<typeof handleAddGridModule>[0]);
    case 'starui_generate_column_defs': return handleGenerateColumnDefs(args as Parameters<typeof handleGenerateColumnDefs>[0]);
    case 'starui_config_or_code': return handleConfigOrCode(args as unknown as Parameters<typeof handleConfigOrCode>[0]);
    case 'starui_generate_layout': {
      const layoutArgs = args as unknown as Parameters<typeof handleGenerateLayout>[0] & {
        projectDir?: string;
        fileName?: string;
      };
      const generated = handleGenerateLayout(layoutArgs);
      if (layoutArgs.projectDir) {
        const written = handleWriteLayoutToProject({
          projectDir: layoutArgs.projectDir,
          layout: generated.layout,
          fileName: layoutArgs.fileName ?? generated.fileName,
        });
        return { ...generated, ...written };
      }
      return generated;
    }
    case 'starui_validate_layout': return handleValidateLayout(args.layout);
    case 'starui_import_layout_pack': return handleImportLayoutPack(args as Parameters<typeof handleImportLayoutPack>[0]);
    case 'starui_layout_recipe': return handleLayoutRecipe(args as Parameters<typeof handleLayoutRecipe>[0]);
    case 'starui_profile_recipe': return handleLayoutRecipe(args as Parameters<typeof handleLayoutRecipe>[0]);
    case 'starui_explain_layout_module': return handleExplainLayoutModule(args.moduleId as string);
    case 'starui_list_ui_components': return handleListUiComponents();
    case 'starui_scaffold_app': return scaffoldApp(args as Parameters<typeof scaffoldApp>[0]);
    case 'starui_upgrade_scaffold': return handleUpgradeScaffold(args as Parameters<typeof handleUpgradeScaffold>[0]);
    case 'starui_list_provider_types': return handleListProviderTypes();
    case 'starui_generate_stomp_config': return handleGenerateStompConfig(args as Parameters<typeof handleGenerateStompConfig>[0]);
    case 'starui_validate_provider_config': return handleValidateProviderConfig(args.config as Record<string, unknown>);
    case 'starui_add_provider_to_project': return handleAddProviderToProject(args as Parameters<typeof handleAddProviderToProject>[0]);
    case 'starui_setup_stomp_dev': return handleSetupStompDev(args as Parameters<typeof handleSetupStompDev>[0]);
    case 'starui_test_stomp_connection': return handleTestStompConnection(args as Parameters<typeof handleTestStompConnection>[0]);
    case 'starui_diagnose_data_plane': return handleDiagnoseDataPlane(args as Parameters<typeof handleDiagnoseDataPlane>[0]);
    case 'starui_explain_provider_toolbar': return handleExplainProviderToolbar();
    case 'starui_provider_config_from_csv': return handleProviderConfigFromCsv(args as Parameters<typeof handleProviderConfigFromCsv>[0]);
    case 'starui_check_tarball_versions': return handleCheckTarballVersions(args as Parameters<typeof handleCheckTarballVersions>[0]);
    case 'starui_refresh_libs': return handleRefreshLibs(args as Parameters<typeof handleRefreshLibs>[0]);
    case 'starui_explain_import_alias': return handleExplainImportAlias(args.importPath as string | undefined);
    case 'starui_bucket_dependency_graph': return handleBucketDependencyGraph(args.templateId as string | undefined);
    case 'starui_explain_component_registration': return handleExplainComponentRegistration();
    case 'starui_add_blotter_route': return handleAddBlotterRoute(args as Parameters<typeof handleAddBlotterRoute>[0]);
    case 'starui_generate_view_manifest': return handleGenerateViewManifest(args as Parameters<typeof handleGenerateViewManifest>[0]);
    case 'starui_openfin_launch_checklist': return handleOpenfinLaunchChecklist(args as Parameters<typeof handleOpenfinLaunchChecklist>[0]);
    case 'starui_add_ui_component': return handleAddUiComponent(args as Parameters<typeof handleAddUiComponent>[0]);
    case 'starui_audit_app_design': return handleAuditAppDesign(args as Parameters<typeof handleAuditAppDesign>[0]);
    case 'starui_add_shell_layout': return handleAddShellLayout(args as Parameters<typeof handleAddShellLayout>[0]);
    case 'starui_theme_playground_snippet': return handleThemePlaygroundSnippet();
    case 'starui_shadcn_component_picker': return handleShadcnComponentPicker(args.description as string);
    case 'starui_validate_scaffold': return handleValidateScaffold(args as Parameters<typeof handleValidateScaffold>[0]);
    case 'starui_smoke_test_app': return handleSmokeTestApp(args as Parameters<typeof handleSmokeTestApp>[0]);
    case 'starui_validate_design_compliance': return handleValidateDesignCompliance(args as Parameters<typeof handleValidateDesignCompliance>[0]);
    case 'starui_validate_stomp_e2e': return handleValidateStompE2e(args as Parameters<typeof handleValidateStompE2e>[0]);
    case 'starui_snapshot_grid_config': return handleSnapshotGridConfig(args as Parameters<typeof handleSnapshotGridConfig>[0]);
    case 'starui_print_install_config': return handlePrintInstallConfig(args as Parameters<typeof handlePrintInstallConfig>[0]);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
