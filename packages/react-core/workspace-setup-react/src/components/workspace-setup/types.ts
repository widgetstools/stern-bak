/**
 * Internal types for the WorkspaceSetup editor's three-pane layout.
 *
 * These types describe the SELECTION model the panes share — when a
 * component row is clicked in pane ① it becomes the inspector's
 * subject in pane ③; when a dock node is clicked in pane ② it
 * becomes the inspector's subject instead. The InspectorPane
 * reads `selection` and renders the appropriate form.
 */

import type { RegistryEntry } from '@wellsfargo-starui/openfin-platform/config';

/** What's currently selected across the editor — drives Inspector pane content. */
export type EditorSelection =
  | { kind: 'none' }
  | { kind: 'component'; entryId: string }
  | { kind: 'dock-item'; itemId: string };

/** Filter chips along the top of the Components pane. */
export type ComponentFilter = 'all' | 'in-dock' | 'not-in-dock' | 'singleton';

/**
 * A blank registry entry suitable for "+ New".
 *
 * The draft starts with a temporary UUID `id` so the parent's
 * `EditorSelection` (which tracks the inspected entry by id) has a
 * stable handle while the user is typing — without it, every
 * keystroke that touched type/subtype unmounted the input.
 *
 * The temp id is REPLACED on save (see `useRegistryEditor.save` →
 * `normalizeEntries`) with the canonical
 * `${componentType}-${componentSubType}` lowercase. Same goes for
 * `configId`. So nothing UUID-shaped ever lands on disk for a
 * registry entry — the temp id only exists for the duration of the
 * editing session.
 */
export function newDraftEntry(env: { appId: string; configServiceUrl: string }): RegistryEntry {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? `draft-${crypto.randomUUID()}`
      : `draft-${Date.now()}`,
    hostUrl: '',
    iconId: '',
    componentType: '',
    componentSubType: '',
    configId: '',
    displayName: 'New Component',
    createdAt: new Date().toISOString(),
    type: 'internal',
    usesHostConfig: true,
    appId: env.appId,
    configServiceUrl: env.configServiceUrl,
    singleton: false,
  };
}
