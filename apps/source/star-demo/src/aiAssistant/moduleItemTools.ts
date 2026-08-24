/**
 * The generic module-item tools: one addressing scheme — (moduleId,
 * collection, itemId) — over every customizer module that stores a list or
 * map of items. See `moduleCollections.ts` for the catalog and the rationale.
 *
 * Split out of `useToolExecutor.ts` to keep that file under the repo's
 * 800-LOC ceiling; these four handlers are cohesive and share one preamble.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import {
  resolveCollection,
  readItems,
  writeItems,
  itemId,
  type CollectionSpec,
} from './moduleCollections';
import { readDefaultProfile, patchGridModule, resolveGridEntry, describeFanOut } from './gridProfiles';

export interface ToolExecutionResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

/** Shared preamble: resolve the grid and the collection, or explain why not. */
async function resolveItemTarget(
  args: Record<string, unknown>,
): Promise<{ ok: true; entry: RegistryEntry; spec: CollectionSpec } | { ok: false; summary: string }> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };
  const lookup = resolveCollection(args.moduleId, args.collection);
  if (!lookup.ok) return { ok: false, summary: lookup.error };
  return { ok: true, entry, spec: lookup.spec };
}

function readOnlyRefusal(spec: CollectionSpec): ToolExecutionResult {
  return { ok: false, summary: `${spec.moduleId}.${spec.collection} is written by the grid runtime and can't be edited.` };
}

export async function listModuleItems(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const target = await resolveItemTarget(args);
  if (!target.ok) return target;
  const { entry, spec } = target;

  const profile = await readDefaultProfile(configManager, entry.configId);
  const moduleData = profile.state[spec.moduleId]?.data as Record<string, unknown> | undefined;
  const items = readItems(moduleData, spec);
  return {
    ok: true,
    summary: `${items.length} item(s) in ${spec.moduleId}.${spec.collection} on "${entry.displayName}".`,
    data: { moduleId: spec.moduleId, collection: spec.collection, idField: spec.idField, items },
  };
}

export async function addModuleItem(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const target = await resolveItemTarget(args);
  if (!target.ok) return target;
  const { entry, spec } = target;
  if (spec.readOnly) return readOnlyRefusal(spec);

  const item = args.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, summary: 'item must be an object shaped as the module stores it — call get_feature_guide for the shape.' };
  }
  const incoming = { ...(item as Record<string, unknown>) };
  if (typeof incoming[spec.idField] !== 'string' || !incoming[spec.idField]) {
    incoming[spec.idField] = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const id = incoming[spec.idField] as string;

  let duplicate = false;
  const fan = await patchGridModule(configManager, entry, spec.moduleId, (prev) => {
    const prevData = (prev as Record<string, unknown> | undefined) ?? {};
    const items = readItems(prevData, spec);
    if (items.some((existing) => itemId(existing, spec) === id)) {
      duplicate = true;
      return prevData;
    }
    return { ...prevData, [spec.collection]: writeItems(spec, [...items, incoming]) };
  });

  return duplicate
    ? { ok: false, summary: `${spec.moduleId}.${spec.collection} already has an item with ${spec.idField} "${id}". Use update_module_item to change it.` }
    : {
        ok: true,
        summary: `Added ${spec.moduleId}.${spec.collection} item "${id}" to "${entry.displayName}"${describeFanOut(fan)}.`,
        data: { [spec.idField]: id },
      };
}

export async function updateModuleItem(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const target = await resolveItemTarget(args);
  if (!target.ok) return target;
  const { entry, spec } = target;
  if (spec.readOnly) return readOnlyRefusal(spec);

  const id = args.itemId as string | undefined;
  const patch = args.patch;
  if (!id) return { ok: false, summary: 'Missing required field: itemId.' };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, summary: 'patch must be an object of keys to merge over the item.' };
  }

  let found = false;
  const fan = await patchGridModule(configManager, entry, spec.moduleId, (prev) => {
    const prevData = (prev as Record<string, unknown> | undefined) ?? {};
    let touched = false;
    const items = readItems(prevData, spec).map((existing) => {
      if (itemId(existing, spec) !== id) return existing;
      touched = true;
      found = true;
      // The id is the join key to everything referencing this item — a patch
      // must never move it.
      return { ...existing, ...(patch as Record<string, unknown>), [spec.idField]: id };
    });
    // A window that never had this item is left alone rather than having one
    // conjured into it.
    if (!touched) return prevData;
    return { ...prevData, [spec.collection]: writeItems(spec, items) };
  });

  return found
    ? { ok: true, summary: `Updated ${spec.moduleId}.${spec.collection} item "${id}" on "${entry.displayName}"${describeFanOut(fan)}.` }
    : { ok: false, summary: `No item with ${spec.idField} "${id}" in ${spec.moduleId}.${spec.collection}. Call list_module_items to see ids.` };
}

export async function removeModuleItem(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const target = await resolveItemTarget(args);
  if (!target.ok) return target;
  const { entry, spec } = target;
  if (spec.readOnly) return readOnlyRefusal(spec);

  const id = args.itemId as string | undefined;
  if (!id) return { ok: false, summary: 'Missing required field: itemId.' };

  let found = false;
  const fan = await patchGridModule(configManager, entry, spec.moduleId, (prev) => {
    const prevData = (prev as Record<string, unknown> | undefined) ?? {};
    const items = readItems(prevData, spec);
    const kept = items.filter((existing) => itemId(existing, spec) !== id);
    if (kept.length === items.length) return prevData;
    found = true;
    return { ...prevData, [spec.collection]: writeItems(spec, kept) };
  });

  return found
    ? { ok: true, summary: `Removed ${spec.moduleId}.${spec.collection} item "${id}" from "${entry.displayName}"${describeFanOut(fan)}.` }
    : { ok: false, summary: `No item with ${spec.idField} "${id}" in ${spec.moduleId}.${spec.collection}. Call list_module_items to see ids.` };
}
