/**
 * OpenFin notifications loader + dispatch.
 *
 * This is the single place in the platform that touches
 * `@openfin/workspace/notifications`. Framework adapters (e.g. `@wellsfargo-starui/grid`'s
 * alerts module) must NOT import `@openfin/*` directly — per
 * docs/ARCHITECTURE.md only `@wellsfargo-starui/host-openfin` / `@wellsfargo-starui/openfin-platform`
 * may. Those packages consume the seam below via an injected function instead.
 *
 * The import is dynamic + string-literal-only and wrapped in try/catch, so:
 *   - bundlers leave it as a runtime call (no build-time dependency), and
 *   - the bridge degrades silently in non-OpenFin apps where the package /
 *     `fin` global is absent.
 */

export interface OpenFinNotificationsApi {
  register?: () => Promise<unknown>;
  create: (options: Record<string, unknown>) => Promise<unknown>;
}

/** Transport-agnostic notification payload. The caller maps its own domain
 *  model (severity, rule name, …) onto these fields. */
export interface OpenFinNotificationInput {
  /** OpenFin platform/app uuid the notification is attributed to. */
  platformUuid?: string;
  title: string;
  body: string;
  /** OpenFin notification category id (e.g. 'info' | 'warning' | 'critical'). */
  category: string;
  customData?: Record<string, unknown>;
}

/**
 * Lazily load the OpenFin notifications API. Returns `null` when the package
 * is unavailable (non-OpenFin host) so callers can no-op.
 */
export async function loadOpenFinNotificationsApi(): Promise<OpenFinNotificationsApi | null> {
  try {
    // @ts-ignore — optional peer dependency; absent in non-OpenFin apps.
    const mod = (await import('@openfin/workspace/notifications')) as unknown;
    if (mod && typeof mod === 'object' && 'create' in mod) {
      return mod as OpenFinNotificationsApi;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a single OpenFin notification. Swallows dispatch failures (logs a
 * warning) so a flaky notification centre never breaks the host app.
 */
export async function dispatchOpenFinNotification(
  api: OpenFinNotificationsApi,
  input: OpenFinNotificationInput,
): Promise<void> {
  try {
    await api.create({
      platform: input.platformUuid,
      title: input.title,
      body: input.body,
      toast: 'transient',
      category: input.category,
      template: 'markdown',
      customData: input.customData,
    });
  } catch (err) {
    console.warn('[host-openfin] OpenFin notification dispatch failed:', err);
  }
}
