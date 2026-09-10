/**
 * Brand on a GridApi: the SSRM surface attaches a session whose
 * `resolve` reads dataset-wide aggregates from the worker cache.
 * Core must not import `@wellsfargo-starui/grid`; both sides share
 * this key instead.
 */
export const SSRM_EXPR_AGG_KEY = '__ssrmExprAgg' as const;

export interface SsrmExprAggLookup {
  resolve(fnName: string, columnId: string): unknown;
}

/**
 * Read {@link EvaluationContext.resolveAggregate} off a GridApi when
 * the SSRM binder has attached a session. CSRM (and tests) have no
 * session — returns `undefined` so `SUM([col])` keeps using `allRows`.
 */
export function lookupSsrmExprAggregate(
  api: object | null | undefined,
): ((fnName: string, columnId: string) => unknown) | undefined {
  if (!api || typeof api !== 'object') return undefined;
  const session = (api as Record<PropertyKey, unknown>)[SSRM_EXPR_AGG_KEY];
  if (!session || typeof session !== 'object') return undefined;
  const resolve = (session as SsrmExprAggLookup).resolve;
  if (typeof resolve !== 'function') return undefined;
  return (fnName, columnId) => resolve.call(session, fnName, columnId);
}
