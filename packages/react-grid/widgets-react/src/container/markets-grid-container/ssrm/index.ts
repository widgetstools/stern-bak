/**
 * Server-Side Row Model for MarketsGrid, served by a per-window Perspective
 * (WASM) replica table — see `useSsrmData` for the wiring story. Ported from
 * the ssrm-grid reference implementation onto this platform's provider
 * subscription and column-definition model.
 */
export { useSsrmData, type UseSsrmDataParams, type UseSsrmDataResult } from './useSsrmData.js';
export {
  PerspectiveSsrmDatasource,
  ROW_ID_FIELD,
  type PerspectiveSsrmDatasourceOptions,
  type SsrmLiveUpdateMode,
} from './datasource.js';
export { createSsrmGridOptions, type SsrmGridOptionsConfig } from './ssrmGridOptions.js';
export {
  createSsrmFeedTable,
  type FeedTableEvent,
  type SsrmFeedTable,
  type SsrmFeedTableOptions,
} from './feedTable.js';
export {
  INDEX_COLUMN,
  buildSchemaFromColDefs,
  flattenRow,
  flattenRowsColumnar,
  typeForColDef,
  type PerspectiveSchema,
} from './schema.js';
export {
  engineAssetsFromWorkerUrl,
  getSsrmEngineClient,
  type SsrmEngineAssets,
} from './engineClient.js';
