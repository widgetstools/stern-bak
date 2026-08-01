/**
 * providerConfigIo — export a DataProviderConfig to a portable JSON
 * file and parse one back in.
 *
 * The export deliberately drops the identity/ownership fields
 * (`providerId`, `userId`, `isDefault`) so a bundle is portable across
 * users and environments: importing always lands as a fresh unsaved
 * draft that the importer owns and can `Create` as a new row. The
 * connection, fields, columns, key column and behaviour all round-trip
 * because they live on `config`.
 */

import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';

const EXPORT_KIND = 'starui.dataProvider';
const EXPORT_VERSION = 1;

/**
 * The transferable subset of a provider — everything except the fields
 * that bind a row to a specific id/owner. This is what an import yields
 * and what the editor turns into a new draft.
 */
export type PortableProviderConfig = Omit<
  DataProviderConfig,
  'providerId' | 'userId' | 'isDefault'
>;

interface ProviderConfigExport {
  kind: typeof EXPORT_KIND;
  version: number;
  exportedAt: string;
  provider: PortableProviderConfig;
}

function toFileStem(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'data-provider'
  );
}

/** Strip identity/ownership fields — the part of a provider that travels. */
export function toPortableProviderConfig(
  provider: DataProviderConfig,
): PortableProviderConfig {
  const { providerId: _id, userId: _userId, isDefault: _isDefault, ...portable } =
    structuredClone(provider);
  return portable;
}

/**
 * Serialize the current working provider and trigger a browser download.
 * Captures unsaved edits — it reads from whatever config object is passed
 * in, not from persisted storage.
 */
export function exportProviderConfig(provider: DataProviderConfig): void {
  const payload: ProviderConfigExport = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    provider: toPortableProviderConfig(provider),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `starui-data-provider-${toFileStem(provider.name)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Parse an exported file back into a portable provider. Accepts both the
 * wrapped export shape ({ kind, version, provider }) and a bare
 * `DataProviderConfig`/portable object, so a file produced elsewhere
 * (e.g. copied straight from the config store) still imports. Throws a
 * user-readable Error on anything it can't make sense of.
 */
export function parseProviderConfigImport(text: string): PortableProviderConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('File does not contain a data provider config.');
  }

  // Unwrap the export envelope when present; otherwise treat the object
  // itself as the provider.
  const candidate =
    parsed.kind === EXPORT_KIND && isRecord(parsed.provider)
      ? parsed.provider
      : parsed;

  if (!isRecord(candidate)) {
    throw new Error('File does not contain a data provider config.');
  }

  if (typeof candidate.providerType !== 'string') {
    throw new Error('Missing or invalid "providerType".');
  }
  if (!isRecord(candidate.config)) {
    throw new Error('Missing or invalid "config".');
  }

  // Re-derive a clean portable shape — drop any identity fields that may
  // have ridden along on a bare export.
  return toPortableProviderConfig({
    ...(candidate as unknown as DataProviderConfig),
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : 'imported provider',
    userId: '',
  });
}
