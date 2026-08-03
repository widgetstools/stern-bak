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
  type FeedTable,
  type FeedDiagnostic,
} from './perspectiveTableFeed.js';
