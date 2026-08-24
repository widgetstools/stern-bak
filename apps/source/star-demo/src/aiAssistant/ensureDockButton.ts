/**
 * Idempotently registers the AI Assistant as a dock-launchable component.
 *
 * Self-heals on every boot (checked by `id`), so it works whether the
 * IndexedDB is fresh or already has real user data — unlike `seed.json`,
 * which only applies to an empty DB. See `registryOps.ts` for the
 * underlying registry/dock mechanics.
 */
import { addRegistryEntry, addDockButton, buildRegistryEntry } from './registryOps';

export const AI_ASSISTANT_REGISTRY_ID = 'ai-assistant';

export async function ensureAiAssistantDockButton(appId: string): Promise<void> {
  await addRegistryEntry(
    buildRegistryEntry({
      id: AI_ASSISTANT_REGISTRY_ID,
      hostUrl: '/#/ai-assistant',
      displayName: 'AI Assistant',
      componentType: 'tool',
      componentSubType: 'ai-assistant',
      configId: AI_ASSISTANT_REGISTRY_ID,
      iconId: 'lucide:sparkles',
      appId,
      singleton: true,
      asWindow: true,
    }),
  );
  await addDockButton({
    registryEntryId: AI_ASSISTANT_REGISTRY_ID,
    tooltip: 'AI Assistant',
    iconId: 'lucide:sparkles',
    asWindow: true,
  });
}
