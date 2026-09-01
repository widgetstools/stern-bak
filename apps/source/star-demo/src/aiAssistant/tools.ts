/**
 * The AI Assistant's tool vocabulary: every tool name, and which of them only
 * read state. The wire schemas live in `toolSchemas.ts` (split for size) and
 * are re-exported from here, so `./tools` stays the single import site.
 *
 * Every tool that touches a grid takes a `targetGridId` — a Component Registry
 * entry id like "grid-test", discovered via `list_grids`. It resolves to that
 * entry's `configId`, which is the profile-scope `instanceId`.
 */

export type ToolName =
  | 'list_grids'
  | 'list_data_providers'
  | 'get_grid_columns'
  | 'list_grid_instances'
  | 'describe_data_fields'
  | 'list_mock_datasets'
  | 'list_provider_fields'
  | 'infer_provider_fields'
  | 'set_provider_columns'
  | 'diagnose_grid'
  | 'summarize_grid_data'
  | 'query_grid_data'
  | 'list_cell_renderers'
  | 'undo_last_change'
  | 'list_grid_customizations'
  | 'list_grid_modules'
  | 'get_feature_guide'
  | 'get_module_settings'
  | 'update_module_settings'
  | 'list_module_items'
  | 'add_module_item'
  | 'update_module_item'
  | 'remove_module_item'
  | 'create_blotter'
  | 'open_blotter'
  | 'rename_blotter'
  | 'delete_blotter'
  | 'set_grid_provider'
  | 'create_data_provider'
  | 'update_data_provider'
  | 'delete_data_provider'
  | 'add_calculated_column'
  | 'remove_calculated_column'
  | 'add_conditional_styling_rule'
  | 'update_conditional_styling_rule'
  | 'remove_conditional_styling_rule'
  | 'rename_column'
  | 'set_column_visibility'
  | 'set_column_style'
  | 'set_column_behavior'
  | 'set_column_layout'
  | 'set_row_grouping'
  | 'set_sort'
  | 'set_filter_model'
  | 'set_quick_filter'
  | 'set_group_expansion'
  | 'list_profiles'
  | 'create_profile'
  | 'update_profile'
  | 'delete_profile'
  | 'switch_profile'
  | 'reload_grid'
  | 'clear_column_style';

/** Tools that only read state — safe to auto-execute without user confirmation. */
export const READ_ONLY_TOOLS: readonly ToolName[] = [
  'list_grids',
  'list_data_providers',
  'get_grid_columns',
  'describe_data_fields',
  'list_mock_datasets',
  'list_provider_fields',
  'infer_provider_fields',
  'list_grid_instances',
  'list_profiles',
  'diagnose_grid',
  // Read-only in the strict sense: they read the hub's cache and never write.
  // They can be slow (a snapshot), but they change nothing.
  'summarize_grid_data',
  'query_grid_data',
  'list_cell_renderers',
  'list_grid_customizations',
  'list_grid_modules',
  'get_feature_guide',
  'get_module_settings',
  'list_module_items',
];

export function isReadOnlyTool(name: string): name is (typeof READ_ONLY_TOOLS)[number] {
  return (READ_ONLY_TOOLS as readonly string[]).includes(name);
}


// The wire schemas live in their own modules (size); re-exported here so every
// import site keeps using `./tools` as the one entry point.
export { TOOL_SCHEMAS } from './toolSchemas';
export type { OpenAIToolSchema } from './toolSchemaShared';