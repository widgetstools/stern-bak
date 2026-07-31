/**
 * Console tracing for `{{providerName.key}}` tokens in STOMP provider cfg.
 *
 * Enable all traces (even when no tokens): in DevTools console —
 *   globalThis.__STARUI_TEMPLATE_TRACE__ = true
 * then hard-refresh / restart the SharedWorker.
 *
 * By default, logs emit only when a traced string contains `{{...}}`.
 */

import type { StompProviderConfig } from '@wellsfargo-starui/types';
import type { AppDataLookup } from './resolver.js';

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export type TemplateLookup = AppDataLookup;

export function isTemplateTraceForced(): boolean {
  try {
    return (globalThis as { __STARUI_TEMPLATE_TRACE__?: boolean }).__STARUI_TEMPLATE_TRACE__ === true;
  } catch {
    return false;
  }
}

function shouldTraceString(value: string | undefined): boolean {
  if (!value) return isTemplateTraceForced();
  return isTemplateTraceForced() || value.includes('{{');
}

function resolveTokenExpr(expr: string, lookup?: TemplateLookup): {
  providerName: string;
  key: string;
  value: unknown;
  status: 'resolved' | 'missing' | 'invalid';
} {
  const dot = expr.indexOf('.');
  if (dot < 0) {
    return { providerName: expr, key: '', value: undefined, status: 'invalid' };
  }
  const providerName = expr.slice(0, dot).trim();
  const key = expr.slice(dot + 1).trim();
  if (!providerName || !key || !lookup) {
    return { providerName, key, value: undefined, status: 'missing' };
  }
  const value = lookup(providerName, key);
  if (value === undefined || value === null) {
    return { providerName, key, value, status: 'missing' };
  }
  return { providerName, key, value, status: 'resolved' };
}

function traceStringField(
  phase: string,
  field: string,
  raw: string | undefined,
  lookup?: TemplateLookup,
  extra?: Record<string, unknown>,
): void {
  if (!shouldTraceString(raw)) return;
  const value = raw ?? '';
  const tokenExprs = [...value.matchAll(TOKEN_RE)].map((m) => m[1]!.trim());
  const tokenAudit = tokenExprs.map((expr) => ({
    expr,
    ...resolveTokenExpr(expr, lookup),
  }));
  const unresolved = tokenAudit.filter((t) => t.status !== 'resolved');

  // eslint-disable-next-line no-console
  console.info(
    `[starui/stomp-template] ${phase} · ${field}`,
    {
      raw: value,
      hasUnresolvedTokens: unresolved.length > 0,
      tokens: tokenAudit,
      restartExtra: extra ?? null,
      note: unresolved.length > 0
        ? 'AppData token missing in lookup — STOMP wire may still contain {{...}} unless restart overlay fills the key.'
        : tokenExprs.length > 0
          ? 'All referenced AppData tokens resolved in lookup snapshot.'
          : 'No {{...}} tokens in this field.',
    },
  );
}

/** Trace STOMP cfg string fields and AppData token resolution (lookup is optional). */
export function traceStompProviderCfg(
  phase: string,
  cfg: Pick<StompProviderConfig, 'listenerTopic' | 'requestMessage' | 'requestBody' | 'websocketUrl'> | undefined,
  opts: {
    lookup?: TemplateLookup;
    extra?: Record<string, unknown>;
    providerId?: string;
  } = {},
): void {
  if (!cfg) return;
  const header = opts.providerId ? `${phase} providerId=${opts.providerId}` : phase;
  if (isTemplateTraceForced() || [cfg.listenerTopic, cfg.requestMessage, cfg.requestBody, cfg.websocketUrl].some(
    (s) => typeof s === 'string' && s.includes('{{'),
  )) {
    // eslint-disable-next-line no-console
    console.info(`[starui/stomp-template] ${header} — cfg audit`, {
      listenerTopic: cfg.listenerTopic,
      requestMessage: cfg.requestMessage,
      requestBody: cfg.requestBody,
      websocketUrl: cfg.websocketUrl,
      restartExtra: opts.extra ?? null,
    });
  }
  traceStringField(header, 'listenerTopic', cfg.listenerTopic, opts.lookup, opts.extra);
  traceStringField(header, 'requestMessage', cfg.requestMessage, opts.lookup, opts.extra);
  traceStringField(header, 'requestBody', cfg.requestBody, opts.lookup, opts.extra);
  traceStringField(header, 'websocketUrl', cfg.websocketUrl, opts.lookup, opts.extra);
}

/** Log STOMP wire destinations after overlay / asOfDate substitution. */
export function traceStompWireDestinations(
  phase: string,
  details: {
    providerId?: string;
    listenerTopic: string;
    requestMessage?: string;
    requestBody?: string;
    overlay?: Record<string, unknown>;
    cfgHadUnresolvedTemplates?: boolean;
  },
): void {
  if (
    !isTemplateTraceForced()
    && !details.listenerTopic.includes('{{')
    && !(details.requestMessage?.includes('{{'))
  ) {
    return;
  }
  const header = details.providerId
    ? `${phase} providerId=${details.providerId}`
    : phase;
  // eslint-disable-next-line no-console
  console.info(`[starui/stomp-template] ${header} — STOMP wire`, {
    subscribeDestination: details.listenerTopic,
    publishDestination: details.requestMessage ?? '(none)',
    publishBody: details.requestBody ?? '',
    overlay: details.overlay ?? null,
    cfgHadUnresolvedTemplates:
      details.cfgHadUnresolvedTemplates
      ?? (
        details.listenerTopic.includes('{{')
        || Boolean(details.requestMessage?.includes('{{'))
      ),
    warning:
      details.listenerTopic.includes('{{') || details.requestMessage?.includes('{{')
        ? 'UNRESOLVED {{...}} tokens will be sent to the broker verbatim.'
        : undefined,
  });
}

/** Summarize worker AppData rows available for template lookup. */
export function traceWorkerAppDataSnapshot(
  phase: string,
  rows: ReadonlyArray<{ name: string; values: Record<string, unknown> }>,
): void {
  // Forced-only: the old gate (`rows.length === 0` skip) was inverted —
  // it logged one console.info + row/key mapping on EVERY provider
  // start whenever ANY AppData existed, which is effectively always.
  // Unresolved-token failures still surface un-forced via the
  // token-gated cfg audits + the fail-closed assertAppDataResolved.
  if (!isTemplateTraceForced()) return;
  // eslint-disable-next-line no-console
  console.info(`[starui/stomp-template] ${phase} — worker AppData snapshot`, {
    providerCount: rows.length,
    providers: rows.map((r) => ({
      name: r.name,
      keys: Object.keys(r.values),
    })),
  });
}
