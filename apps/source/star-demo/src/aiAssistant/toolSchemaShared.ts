/**
 * The pieces both schema modules need — the wire type and the one property
 * every grid-scoped tool repeats. Its own module so `toolSchemas.ts` and
 * `columnToolSchemas.ts` can share them without importing each other.
 */
import type { ToolName } from './tools';

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TARGET_GRID_ID_PROPERTY = {
  targetGridId: {
    type: 'string',
    description:
      'The blotter\'s configId — the exact string list_grids (or create_blotter) returned, e.g. "grid-test". This is the ONLY identifier: never pass a display name, and never derive an id from one (names can be changed and duplicated; the configId cannot). If you don\'t already hold the configId, call list_grids first. A window\'s instance configId (from list_grid_instances) is also accepted and narrows the call to that one window.',
  },
};

/**
 * Added to every tool that reads or writes a blotter's own state — not to the
 * registry-level ones (create/rename/delete a blotter, bind a provider), where
 * "just this window" has no meaning.
 */
export const INSTANCE_ID_PROPERTY = {
  instanceId: {
    type: 'string',
    description:
      'Narrow the call to ONE open window of that blotter, from list_grid_instances. Reads come from that window and writes go to it alone — its siblings and the template are untouched, so windows opened later will NOT have the change. Omit for the normal case: the blotter as a whole, applied to every open window.',
  },
};
