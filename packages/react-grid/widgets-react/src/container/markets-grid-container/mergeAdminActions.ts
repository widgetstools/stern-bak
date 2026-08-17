/**
 * Admin-action composition shared by {@link MarketsGridContainer} and
 * {@link SsrmMarketsGridContainer}.
 *
 * Lives in its own leaf module for two reasons: both containers build the
 * same three-part menu (refresh pair → data-infra actions → host actions),
 * and the SSRM container previously imported
 * `DATA_PROVIDER_EDITOR_ACTION_ID` from `MarketsGridContainer.js` — which
 * dragged the entire CSRM container (and its `useDataServices` /
 * `@openfin` imports) into the SSRM module graph for one string.
 */
import type { AdminAction } from '@wellsfargo-starui/grid';

/** Stable id for overflow-menu e2e (`admin-action-data-provider-editor`). */
export const DATA_PROVIDER_EDITOR_ACTION_ID = 'data-provider-editor';

/**
 * `prepend` first, then the container's data-infrastructure actions with
 * any id the host also supplies removed, then the host's own. Host entries
 * win on id collision so an app can replace "Data Provider Editor" with its
 * own launcher without ending up with two.
 */
export function mergeAdminActions(
  prepend: AdminAction[],
  infra: AdminAction[],
  user: AdminAction[],
): AdminAction[] {
  const userIds = new Set(user.map((a) => a.id));
  const dedupedInfra = infra.filter((a) => !userIds.has(a.id));
  return [...prepend, ...dedupedInfra, ...user];
}
