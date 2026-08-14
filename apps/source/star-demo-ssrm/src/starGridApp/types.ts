import type { ReactNode } from 'react';
import type { DataPort, RuntimePort } from '@wellsfargo-starui/core/host';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { StorageAdapterFactory } from '@wellsfargo-starui/core';
import type { Theme, Unsubscribe } from '@wellsfargo-starui/types';

/** Scope passed when resolving per-grid host storage. */
export interface StarGridHostScope {
  readonly gridId: string;
  readonly instanceId?: string;
}

/**
 * Resolved StarGrid app shell state — runtime + optional services +
 * a storage factory for per-grid GridHostContext assembly.
 */
export interface StarGridAppState {
  readonly runtime: RuntimePort;
  readonly configManager?: ConfigManager;
  readonly data?: DataPort;
  readonly storageFactory?: StorageAdapterFactory;
  readonly theme: Theme;
  setTheme(theme: Theme): void;
  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe;
  /** Build a GridHostContext scoped to one grid instance. */
  hostForGrid(scope: StarGridHostScope): import('@wellsfargo-starui/core/host').GridHostContext;
}

export type StarGridPersistence = 'memory' | 'localStorage' | 'config';

export interface StarGridAppOptions {
  readonly appId: string;
  readonly userId?: string;
  readonly instanceId?: string;
  readonly componentType?: string;
  /** How profile bundles persist. Default `localStorage`. */
  readonly persistence?: StarGridPersistence;
  readonly runtime?: RuntimePort | Promise<RuntimePort>;
  readonly configManager?: ConfigManager | Promise<ConfigManager>;
  readonly data?: DataPort | Promise<DataPort>;
  readonly loading?: ReactNode;
  /** Optional plugins (e.g. OpenFin workspace shell). */
  readonly plugins?: readonly import('./plugins.js').StarGridPlugin[];
}
