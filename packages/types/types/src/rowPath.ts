/**
 * Row-path helpers — single source of truth lives in
 * `@wellsfargo-starui/types/shared/rowPath` (grammar-aware: `a.b`,
 * `legs[0].rate`, `["a.b"]`). Re-exported here so existing
 * `@wellsfargo-starui/types` consumers keep their import paths.
 */
export {
  COMPOSITE_KEY_SEPARATOR,
  composeRowId,
  getPathAccessor,
  getPathSetter,
  getValueByPath,
  normalizeKeyColumns,
  __resetPathAccessorCaches,
} from '@wellsfargo-starui/types/shared/rowPath';
