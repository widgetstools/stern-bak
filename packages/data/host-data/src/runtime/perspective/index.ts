export {
  createPerspectiveHost,
  installCustomElementsShim,
  type PerspectiveHost,
  type PerspectiveHostOpts,
  type PerspectiveModuleLike,
  type HostClientLike,
  type HostTableLike,
  type ProxySessionLike,
  type FramePortLike,
} from './perspectiveHost.js';

export {
  observeRows,
  toPerspectiveSchema,
  toPerspectiveSchemaFromFields,
  validateIndexColumn,
  type PerspectiveColumnType,
  type PerspectiveSchema,
  type ColumnObservation,
  type SchemaOptions,
  type DerivedSchema,
  type DeclaredField,
} from './perspectiveSchema.js';

export {
  createPerspectiveTableFeed,
  type PerspectiveTableFeed,
  type PerspectiveTableFeedOpts,
  type PerspectiveFieldShadow,
  type FeedTable,
  type FeedDiagnostic,
} from './perspectiveTableFeed.js';

export {
  createPerspectiveQueryEngine,
  queryRegistryKey,
  toQueryViewConfig,
  DEFAULT_RECOMPUTE_THROTTLE_MS,
  DEFAULT_DISTINCT_VALUES_LIMIT,
  DEFAULT_MATCH_SET_SNAPSHOT_CAP,
  type PerspectiveQueryEngine,
  type PerspectiveQueryEngineOpts,
  type PerspectiveQuerySource,
  type PerspectiveQuerySubscription,
  type PerspectiveChangeSource,
  type QueryTableLike,
} from './perspectiveQueryEngine.js';
