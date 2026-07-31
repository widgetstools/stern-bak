/**
 * Deep-clone a registered component's **template** AppConfigRow when
 * Workspace Setup duplicates a registry entry.
 *
 * Registry entries only carry launch metadata (hostUrl, icon, type/subtype).
 * Grid profiles, customizer modules, styling, and theme live on the
 * AppConfigRow keyed by `deriveTemplateConfigId(componentType,
 * componentSubType)`. Cloning an entry without copying that row would
 * leave the duplicate on factory defaults until the user re-configured
 * it from scratch.
 */

import type { AppConfigRow } from '@wellsfargo-starui/host-config';
import { getConfigManager } from './db';
import { deriveTemplateConfigId } from './registryConfigTypes';

export interface CloneRegistryTemplateConfigOptions {
  /** Template configId of the source entry (usually `${type}-${subtype}`). */
  sourceTemplateId: string;
  targetComponentType: string;
  targetComponentSubType: string;
  /** Human-readable label for the cloned template row. */
  displayText: string;
  /** Mirrors `RegistryEntry.singleton` on the cloned entry. */
  singleton?: boolean;
}

/**
 * Copy the source template row onto the target template id with a deep-
 * cloned `payload`. Best-effort: returns `false` when the source row is
 * missing or the write fails; returns `true` when the target row already
 * exists (idempotent retry) or the clone succeeded.
 */
export async function cloneRegistryTemplateConfig(
  opts: CloneRegistryTemplateConfigOptions,
): Promise<boolean> {
  const targetId = deriveTemplateConfigId(
    opts.targetComponentType,
    opts.targetComponentSubType,
  );
  const sourceId = opts.sourceTemplateId.toLowerCase();

  if (targetId === sourceId) return false;

  try {
    const cm = await getConfigManager();
    const existing = await cm.getConfig(targetId);
    if (existing) return true;

    const src = await cm.getConfig(sourceId);
    if (!src) {
      console.warn(
        `[registryClone] no source template at ${sourceId} — clone will start empty`,
      );
      return false;
    }

    const now = new Date().toISOString();
    const payload =
      src.payload != null ? structuredClone(src.payload) : src.payload;

    const clone: AppConfigRow = {
      ...src,
      configId: targetId,
      componentType: opts.targetComponentType,
      componentSubType: opts.targetComponentSubType,
      displayText: opts.displayText,
      isTemplate: true,
      singleton: opts.singleton ?? src.singleton ?? false,
      payload,
      creationTime: now,
      updatedTime: now,
    };

    await cm.saveConfig(clone);
    return true;
  } catch (err) {
    console.warn(
      `[registryClone] template clone failed ${sourceId} → ${targetId}:`,
      err,
    );
    return false;
  }
}
