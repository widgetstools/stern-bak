import type { ViewConfigUpdate } from '@perspective-dev/client';

/*
 * `@perspective-dev/client` re-exports the view config itself but not the two
 * element types inside it, so they are read back off the config rather than
 * hand-copied — a change to either shape then shows up as a type error here
 * instead of at runtime.
 */
export type Sort = NonNullable<ViewConfigUpdate['sort']>[number];
export type Aggregate = NonNullable<NonNullable<ViewConfigUpdate['aggregates']>[string]>;
