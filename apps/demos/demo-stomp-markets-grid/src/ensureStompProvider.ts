import type { DataProviderConfigStore } from '@wellsfargo-starui/host-data/runtime';
import type { DataProviderConfig } from '@wellsfargo-starui/types';
import { positionsProviderDraft } from './providers/positionsStomp.js';

/** Idempotently seed the STOMP provider row; returns catalog `providerId`. */
export async function ensureStompProvider(
  configStore: DataProviderConfigStore,
  userId: string,
): Promise<string> {
  const existing = (await configStore.list(userId, { subtype: 'stomp' }))
    .find((p: DataProviderConfig) => p.name === positionsProviderDraft.name);

  if (existing?.providerId) return existing.providerId;

  const saved = await configStore.save(positionsProviderDraft, userId);
  if (!saved.providerId) throw new Error('Provider save did not return providerId');
  return saved.providerId;
}
