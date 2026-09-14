/**
 * Props contract for {@link BlotterHost} — the flat, single call-site shape
 * `HostedMarketsGrid` established (refactor decision D7), so a consumer moves
 * over by changing the component name (plan D2). Everything the host derives
 * itself (instance / app / user identity, storage, theme, component name) is
 * omitted from the MarketsGrid pass-through.
 */
import type { ReactNode } from 'react';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/data';
import type {
  MarketsGridEventHandlerRegistry,
  MarketsGridHandlerMeta,
  MarketsGridProps,
  StorageAdapterFactory,
} from '@wellsfargo-starui/grid';
import type { ConfigManager } from '../../hosted/types.js';
import type { AgGridThemeMode } from '../../hosted/useAgGridTheme.js';
import type { GridContextLinkConfig } from '../../hosted/useGridContextLink.js';

/** MarketsGrid props a consumer may still set on the host. */
export type BlotterHostGridProps<TData> = Omit<
  MarketsGridProps<TData>,
  | 'rowData'
  | 'rowIdField'
  | 'columnDefs'
  | 'gridLevelData'
  | 'onGridLevelDataLoad'
  | 'headerExtras'
  | 'instanceId'
  | 'appId'
  | 'userId'
  | 'storage'
  | 'theme'
  | 'componentName'
>;

export interface BlotterHostProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends BlotterHostGridProps<TData> {
  /** Logical component name — toolbar info popover, diagnostics, default titles. */
  componentName: string;
  /** Default `instanceId` when neither OpenFin customData nor the URL param resolves one. */
  defaultInstanceId: string;
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
  defaultUserId?: string;
  /** Document title while mounted (restored on unmount). Defaults to `componentName`. */
  documentTitle?: string;
  /** Resolve a ConfigService-backed storage factory from the host ConfigManager. */
  withStorage?: boolean;
  /**
   * Explicit storage factory. Wins over the ConfigService-backed one
   * `withStorage` builds — for tests and for hosts with their own adapter.
   */
  storage?: StorageAdapterFactory;
  /** ConfigManager override; the host singleton is resolved when omitted. */
  configManager?: ConfigManager;
  /** Theme mode for the AG Grid preset. Defaults to `'auto'`. */
  theme?: AgGridThemeMode;
  /** Data-services bundle to mount a `<DataServicesProvider>` for. */
  dataServices?: DataServices;
  /** Hub bundle to mount a `<DataHubProvider>` for (preferred). */
  platform?: ResolvedDataServicesHubBundle;
  /** AppData mirror hydration: `'lazy'` (default) or `'eager'`. */
  dataServicesMode?: 'eager' | 'lazy';
  /** Initial toolbar caption; bound to the OpenFin tab name under OpenFin. */
  caption?: string;
  /** Grid-to-grid context linking over OpenFin's colored "Link" groups. */
  contextLink?: GridContextLinkConfig;
  /** `'appDataProviderName.key'` the historical date is written to. */
  historicalDateAppDataRef?: string;
  /** OpenFin only: edit the active provider (browser runtimes open a dialog). */
  onEditProvider?(providerId: string | null): void;
  /** OpenFin only: open Config Browser (browser runtimes open a dialog). */
  onOpenConfigBrowser?(): void;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
  /** Live provider to select when grid-level data has none. */
  defaultLiveProviderId?: string;
  /** Historical provider to select when the user picks a past toolbar date. */
  defaultHistoricalProviderId?: string;
  /** App registry of event handler functions keyed by stable id. */
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  /** Optional labels for the Custom Settings event-binding UI. */
  handlerMeta?: MarketsGridHandlerMeta;
  /** Fires whenever the resolved row-key field(s) change (`null` until a provider resolves). */
  onRowIdFieldChange?(rowIdField: string | readonly string[] | null): void;
  /** Present so a host can wrap the grid; unused by the host itself. */
  children?: ReactNode;
}
