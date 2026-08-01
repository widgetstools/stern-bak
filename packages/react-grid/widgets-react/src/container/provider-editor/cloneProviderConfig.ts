import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';

const COPY_SUFFIX = / \(copy(?: \d+)?\)$/i;

/** Strip a trailing " (copy)" / " (copy 2)" suffix before re-appending. */
export function copyNameFrom(sourceName: string): string {
  const base = sourceName.trim() || 'untitled';
  return `${base.replace(COPY_SUFFIX, '')} (copy)`;
}

/**
 * Deep-clone a saved provider into an unsaved draft suitable for
 * `configStore.save()` (new row — no `providerId`).
 */
export function cloneProviderConfig(
  source: DataProviderConfig,
  userId: string,
): DataProviderConfig {
  const cloned = structuredClone(source);
  delete cloned.providerId;
  cloned.isDefault = false;
  cloned.name = copyNameFrom(source.name);
  cloned.userId = userId;
  return cloned;
}
