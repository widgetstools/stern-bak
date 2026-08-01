import {
  RESERVED_DEFAULT_PROFILE_ID,
  type ExportedProfilePayload,
  type MarketsGridLocalStorageConfig,
  type ProfileSnapshot,
  type SerializedState,
} from '@wellsfargo-starui/core';
import type { TabSeed } from '../seeds/types';

export interface LabDemoProfileEntry {
  id: string;
  name: string;
  blurb: string;
  seed: TabSeed;
}

const MODULE_SCHEMA_V = 1;

/** Serialize a tab seed into the profile `state` map the platform expects. */
export function serializeTabSeed(seed: TabSeed): Record<string, SerializedState> {
  const state: Record<string, SerializedState> = {};
  if (seed['conditional-styling']) {
    state['conditional-styling'] = { v: MODULE_SCHEMA_V, data: seed['conditional-styling'] };
  }
  if (seed['column-customization']) {
    state['column-customization'] = { v: MODULE_SCHEMA_V, data: seed['column-customization'] };
  }
  if (seed['column-groups']) {
    state['column-groups'] = { v: MODULE_SCHEMA_V, data: seed['column-groups'] };
  }
  if (seed['calculated-columns']) {
    state['calculated-columns'] = { v: MODULE_SCHEMA_V, data: seed['calculated-columns'] };
  }
  if (seed['saved-filters']) {
    state['saved-filters'] = { v: MODULE_SCHEMA_V, data: seed['saved-filters'] };
  }
  if (seed['general-settings']) {
    state['general-settings'] = { v: MODULE_SCHEMA_V, data: seed['general-settings'] };
  }
  if (seed.alerts) {
    state.alerts = { v: MODULE_SCHEMA_V, data: { rules: seed.alerts.rules, settings: seed.alerts.settings } };
  }
  if (seed['smart-edit']) {
    state['smart-edit'] = { v: MODULE_SCHEMA_V, data: seed['smart-edit'] };
  }
  if (seed['bulk-update']) {
    state['bulk-update'] = { v: MODULE_SCHEMA_V, data: seed['bulk-update'] };
  }
  if (seed['plus-minus']) {
    state['plus-minus'] = { v: MODULE_SCHEMA_V, data: seed['plus-minus'] };
  }
  if (seed.shortcuts) {
    state.shortcuts = { v: MODULE_SCHEMA_V, data: seed.shortcuts };
  }
  if (seed['data-change-history']) {
    state['data-change-history'] = { v: MODULE_SCHEMA_V, data: seed['data-change-history'] };
  }
  if (seed['visual-excel']) {
    state['visual-excel'] = { v: MODULE_SCHEMA_V, data: seed['visual-excel'] };
  }
  return state;
}

export function toExportedProfilePayload(
  entry: LabDemoProfileEntry,
  gridId: string,
): ExportedProfilePayload {
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: {
      name: entry.name,
      gridId,
      state: serializeTabSeed(entry.seed),
    },
  };
}

export function buildLabDemoBundle(
  gridId: string,
  profiles: LabDemoProfileEntry[],
  activeProfileId: string,
): MarketsGridLocalStorageConfig {
  const now = Date.now();
  const snapshots: ProfileSnapshot[] = [
    {
      id: RESERVED_DEFAULT_PROFILE_ID,
      gridId,
      name: 'Default (empty)',
      state: {},
      createdAt: now,
      updatedAt: now,
    },
    ...profiles.map((entry) => ({
      id: entry.id,
      gridId,
      name: entry.name,
      state: serializeTabSeed(entry.seed),
      createdAt: now,
      updatedAt: now,
    })),
  ];
  return { gridId, activeProfileId, profiles: snapshots };
}
