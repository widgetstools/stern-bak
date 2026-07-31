/**
 * Stable digest of a normalized deploy seed bundle — used to detect when
 * `seed.json` changed so dev apps can re-seed without wiping IndexedDB manually.
 */

import type { SeedData } from './types';
import { normalizeSeedData } from './normalizeSeedData';

/** localStorage key for the last-applied seed digest per URL. */
export function seedDigestStorageKey(seedConfigUrl: string): string {
  return `starui:seed-digest:${seedConfigUrl}`;
}

/** DJB2 fallback when `crypto.subtle` is unavailable (e.g. some test runners). */
export function simpleSeedDigest(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return `djb2-${(hash >>> 0).toString(16)}`;
}

/**
 * Hash a {@link SeedData} bundle after {@link normalizeSeedData} so export
 * drift (stale row appIds) does not spuriously trigger a re-seed.
 */
export async function computeSeedDigest(seed: SeedData): Promise<string> {
  const text = JSON.stringify(normalizeSeedData(seed));
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return simpleSeedDigest(text);
}
