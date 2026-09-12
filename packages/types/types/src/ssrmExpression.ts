/**
 * SSRM engine expression contract — single source of truth lives in
 * `@wellsfargo-starui/types/shared`. Re-exported here so `@wellsfargo-starui/types`
 * consumers (the expression compiler in core, the SSRM plane in data)
 * share one wire grammar.
 */
export * from '@wellsfargo-starui/types/shared/ssrmExpression';
