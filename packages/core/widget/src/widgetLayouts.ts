import type { AppConfigRow, CreateConfigInput } from '@wellsfargo-starui/core/host/config';
import type { LayoutInfo } from '@wellsfargo-starui/types/shared';

/**
 * The slice of `ConfigManager` these helpers need. Structural so
 * `@wellsfargo-starui/core/widget` stays decoupled from the concrete class — any object
 * with these four methods (the real `ConfigManager`, or a test fake)
 * satisfies it.
 */
export interface LayoutConfigStore {
  findByComponentType(componentType: string, componentSubType?: string): Promise<AppConfigRow[]>;
  createConfig(input: CreateConfigInput): Promise<AppConfigRow>;
  getConfig(configId: string): Promise<AppConfigRow | undefined>;
  deleteConfig(configId: string): Promise<void>;
}

/**
 * Layout helpers — layouts are regular configs with
 * `componentType: 'simple-blotter-layout'` and a
 * `{ parentConfigId, state, isDefault }` payload.
 */
const LAYOUT_COMPONENT_TYPE = 'simple-blotter-layout';

function toLayoutInfo(row: AppConfigRow, parentConfigId: string): LayoutInfo {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    id: row.configId,
    name: row.displayText,
    configId: parentConfigId,
    isDefault: Boolean(p.isDefault),
    state: (p.state ?? {}) as Record<string, unknown>,
    createdAt: row.creationTime,
    updatedAt: row.updatedTime,
  };
}

export async function getLayouts(
  client: LayoutConfigStore,
  parentConfigId: string,
): Promise<LayoutInfo[]> {
  const all = await client.findByComponentType(LAYOUT_COMPONENT_TYPE);
  return all
    .filter((c) => {
      const p = c.payload as Record<string, unknown> | null | undefined;
      return p && p.parentConfigId === parentConfigId;
    })
    .map((c) => toLayoutInfo(c, parentConfigId));
}

export async function saveLayout(
  client: LayoutConfigStore,
  parentConfigId: string,
  name: string,
  state: unknown,
  userId: string,
  appId: string,
): Promise<LayoutInfo> {
  const created = await client.createConfig({
    configId: crypto.randomUUID(),
    appId,
    userId,
    componentType: LAYOUT_COMPONENT_TYPE,
    componentSubType: '',
    isTemplate: false,
    displayText: name,
    payload: { parentConfigId, state, isDefault: false },
    createdBy: userId,
    updatedBy: userId,
  });
  return toLayoutInfo(created, parentConfigId);
}

export async function loadLayout(client: LayoutConfigStore, layoutId: string): Promise<unknown> {
  const row = await client.getConfig(layoutId);
  if (!row) return null;
  const p = row.payload as Record<string, unknown> | null | undefined;
  return p?.state ?? null;
}

export async function deleteLayout(client: LayoutConfigStore, layoutId: string): Promise<void> {
  await client.deleteConfig(layoutId);
}
