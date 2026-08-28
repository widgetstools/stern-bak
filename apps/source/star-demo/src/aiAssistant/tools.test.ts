import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS, READ_ONLY_TOOLS, isReadOnlyTool, type ToolName } from './tools';

/**
 * The vocabulary (`ToolName`), the wire schemas and the executor's switch are
 * three lists that have to agree. TypeScript catches a name that isn't in the
 * union; nothing catches a name in the union with no schema — the model simply
 * never learns the tool exists — or a schema for a tool the executor will
 * reject as unknown. Hence this.
 */
const SCHEMA_NAMES = TOOL_SCHEMAS.map((s) => s.function.name);

/** Kept in sync by hand with `ToolName`: a literal list is the only way to
 *  compare against the type at runtime, since types are erased. */
const DECLARED: ToolName[] = [
  'list_grids', 'list_data_providers', 'get_grid_columns', 'list_grid_instances',
  'describe_data_fields', 'diagnose_grid', 'list_cell_renderers', 'undo_last_change',
  'summarize_grid_data', 'query_grid_data',
  'list_mock_datasets', 'list_provider_fields', 'infer_provider_fields', 'set_provider_columns',
  'list_grid_customizations', 'list_grid_modules', 'get_feature_guide',
  'get_module_settings', 'update_module_settings', 'list_module_items',
  'add_module_item', 'update_module_item', 'remove_module_item',
  'create_blotter', 'open_blotter', 'rename_blotter', 'delete_blotter',
  'set_grid_provider', 'create_data_provider', 'update_data_provider', 'delete_data_provider',
  'add_calculated_column', 'remove_calculated_column',
  'add_conditional_styling_rule', 'update_conditional_styling_rule', 'remove_conditional_styling_rule',
  'rename_column', 'set_column_visibility',
  'set_column_style', 'set_column_behavior', 'set_column_layout', 'set_row_grouping',
  'list_profiles', 'create_profile', 'update_profile', 'delete_profile', 'switch_profile', 'reload_grid',
  'clear_column_style',
];

describe('the tool vocabulary and the wire schemas agree', () => {
  it('ships a schema for every declared tool', () => {
    expect(DECLARED.filter((n) => !SCHEMA_NAMES.includes(n))).toEqual([]);
  });

  it('declares every tool it ships a schema for', () => {
    expect(SCHEMA_NAMES.filter((n) => !DECLARED.includes(n))).toEqual([]);
  });

  it('has no duplicate schemas', () => {
    expect(SCHEMA_NAMES.length).toBe(new Set(SCHEMA_NAMES).size);
  });
});

describe('schema shape', () => {
  it('gives every tool a non-trivial description — it is the only documentation the model gets', () => {
    for (const schema of TOOL_SCHEMAS) {
      expect(schema.function.description.length, schema.function.name).toBeGreaterThan(40);
    }
  });

  /** A tool that accepts unlisted keys silently swallows a typo'd argument. */
  it('closes every parameter object to extra properties', () => {
    for (const schema of TOOL_SCHEMAS) {
      expect(schema.function.parameters.additionalProperties, schema.function.name).toBe(false);
    }
  });

  /** A window is always addressed *within* a blotter, so the pair travel
   *  together — an instanceId with no targetGridId has nothing to validate
   *  against. */
  it('never offers instanceId without targetGridId', () => {
    for (const schema of TOOL_SCHEMAS) {
      const props = schema.function.parameters.properties as Record<string, unknown> | undefined;
      if (!props?.instanceId) continue;
      expect(props.targetGridId, schema.function.name).toBeDefined();
    }
  });

  /** Registry-level tools act on the registration or the dock button, not on
   *  one window's state — offering a window there would promise something the
   *  handler can't honour. */
  it('does not offer instanceId on the registry-level tools', () => {
    const registryLevel = [
      'create_blotter', 'open_blotter', 'rename_blotter', 'delete_blotter',
      'set_grid_provider', 'list_grid_instances', 'undo_last_change',
    ];
    for (const name of registryLevel) {
      const schema = TOOL_SCHEMAS.find((s) => s.function.name === name);
      if (!schema) continue;
      const props = schema.function.parameters.properties as Record<string, unknown> | undefined;
      expect(props?.instanceId, name).toBeUndefined();
    }
  });

  it('requires targetGridId wherever the tool takes one', () => {
    for (const schema of TOOL_SCHEMAS) {
      const props = schema.function.parameters.properties as Record<string, unknown> | undefined;
      if (!props?.targetGridId) continue;
      const required = (schema.function.parameters.required as string[] | undefined) ?? [];
      expect(required, schema.function.name).toContain('targetGridId');
    }
  });
});

describe('the read-only set', () => {
  it('names only tools that exist', () => {
    expect(READ_ONLY_TOOLS.filter((n) => !DECLARED.includes(n))).toEqual([]);
  });

  /** Auto-execution hangs off this: a mutating tool listed here would apply
   *  without the user ever being asked. */
  it('excludes everything that writes', () => {
    const writers = DECLARED.filter((n) => /^(set|add|create|update|remove|delete|clear|switch|reload|undo|open|rename)_/.test(n));
    expect(writers.filter(isReadOnlyTool)).toEqual([]);
  });

  it('covers the discovery tools a model needs before it can act', () => {
    for (const name of ['list_grids', 'get_grid_columns', 'list_cell_renderers', 'get_feature_guide'] as const) {
      expect(isReadOnlyTool(name), name).toBe(true);
    }
  });
});
