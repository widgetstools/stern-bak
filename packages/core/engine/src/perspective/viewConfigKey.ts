/**
 * Stable identity for a Perspective View config.
 *
 * Two callers, one meaning. The window keys its live Views on this so a
 * block request that changes nothing reuses the View it already has instead
 * of rebuilding it — a rebuild costs a full recompute AND a delete, and
 * delete is the dangerous operation here. The worker's query engine keys its
 * subscription registry on it so two windows asking the same whole-book
 * question share ONE View rather than one each.
 *
 * That second use is why the key is over the TRANSLATED config rather than
 * over whatever the caller asked with: two windows can arrive at the same
 * filter through different saved profiles, and it is the View they should
 * share, not the request that produced it.
 *
 * Key order is normalized because AG Grid rebuilds these objects per
 * request, and object key order is not stable across the paths that build
 * them.
 */
import type { PerspectiveViewConfig } from './filterTranslate';

export function viewConfigKey(config: PerspectiveViewConfig): string {
  return JSON.stringify({
    sort: config.sort ?? null,
    filter: config.filter ?? null,
    group_by: config.group_by ?? null,
    aggregates: config.aggregates
      ? Object.keys(config.aggregates)
          .sort()
          .map((k) => [k, config.aggregates![k]])
      : null,
    expressions: config.expressions
      ? Object.keys(config.expressions)
          .sort()
          .map((k) => [k, config.expressions![k]])
      : null,
    columns: config.columns ?? null,
  });
}
