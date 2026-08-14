/**
 * Editing — the merged numeric-edit module state. One module id, one
 * persisted envelope, four sub-slices that used to be standalone modules
 * (smart-edit, bulk-update, plus-minus, shortcuts). The sub-slice types,
 * initial values, and defensive deserializers stay in their own files —
 * this module composes them.
 *
 * Persistence: profiles saved before the merge carry four envelopes keyed
 * by the legacy module ids. `migrateLegacyEditingState` reads those and is
 * deliberately version-TOLERANT — each legacy payload routes through its
 * family's defensive per-field deserializer regardless of the envelope's
 * `v`. (The old per-module path dropped smart-edit payloads stamped v1 by
 * the lab profile generator because the module was v2 with no `migrate` —
 * that state loss is fixed here, not preserved.)
 */

import {
  deserializeBulkUpdateState,
  INITIAL_BULK_UPDATE,
  type BulkUpdateState,
} from '../bulk-update/state';
import {
  deserializePlusMinusState,
  INITIAL_PLUS_MINUS,
  type PlusMinusState,
} from '../plus-minus/state';
import {
  deserializeShortcutsState,
  INITIAL_SHORTCUTS,
  type ShortcutsState,
} from '../shortcuts/state';
import {
  deserializeSmartEditState,
  INITIAL_SMART_EDIT,
  type SmartEditState,
} from '../smart-edit/state';

export const EDITING_MODULE_ID = 'editing';
export const EDITING_SCHEMA_VERSION = 1;

/** Legacy per-module envelope keys read by `migrateLegacyEditingState`. */
export const LEGACY_EDITING_MODULE_IDS = [
  'smart-edit',
  'bulk-update',
  'plus-minus',
  'shortcuts',
] as const;

export interface EditingState {
  smartEdit: SmartEditState;
  bulkUpdate: BulkUpdateState;
  plusMinus: PlusMinusState;
  shortcuts: ShortcutsState;
}

export const INITIAL_EDITING: EditingState = {
  smartEdit: INITIAL_SMART_EDIT,
  bulkUpdate: INITIAL_BULK_UPDATE,
  plusMinus: INITIAL_PLUS_MINUS,
  shortcuts: INITIAL_SHORTCUTS,
};

export function deserializeEditingState(raw: unknown): EditingState {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof EditingState, unknown>>;
  return {
    smartEdit: deserializeSmartEditState(d.smartEdit),
    bulkUpdate: deserializeBulkUpdateState(d.bulkUpdate),
    plusMinus: deserializePlusMinusState(d.plusMinus),
    shortcuts: deserializeShortcutsState(d.shortcuts),
  };
}

/** Unwrap a `{ v, data }` envelope; bare values pass through untouched. */
function envelopeData(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'v' in raw && 'data' in raw) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

/**
 * Assemble an `EditingState` from a pre-merge snapshot's legacy envelopes.
 * `envelopes` is keyed by legacy module id; absent slices fall back to
 * their initial state via the family deserializers.
 */
export function migrateLegacyEditingState(
  envelopes: Readonly<Record<string, unknown>>,
): EditingState {
  return {
    smartEdit: deserializeSmartEditState(envelopeData(envelopes['smart-edit'])),
    bulkUpdate: deserializeBulkUpdateState(envelopeData(envelopes['bulk-update'])),
    plusMinus: deserializePlusMinusState(envelopeData(envelopes['plus-minus'])),
    shortcuts: deserializeShortcutsState(envelopeData(envelopes['shortcuts'])),
  };
}
