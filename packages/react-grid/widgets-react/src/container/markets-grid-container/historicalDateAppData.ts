/**
 * The `historicalDateAppDataRef` contract, in one place.
 *
 * A container prop of the form `'appDataProviderName.key'` (e.g.
 * `'positions.asOfDate'`) naming where the chosen historical date is written.
 * The historical provider's cfg references the same entry as
 * `{{positions.asOfDate}}`, so the value flows through to the transport.
 *
 * `MarketsGridContainer` parsed that string inline at THREE call sites — the
 * restore-on-mount effect, the date-commit write, and the reload write — each
 * with its own copy of the `indexOf('.')` / `slice` pair and its own
 * dot-position guard. Both containers now share these two functions, so
 * "what a ref means" has one definition and the SSRM container did not
 * arrive with a fourth copy.
 */
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';

/** The read side of an AppData store (`useAppDataStore().store`). */
export interface HistoricalDateReader {
  get(name: string, key: string): unknown;
}

/** The write side. `set` is awaitable on the real store, `void` on a lookup. */
export interface HistoricalDateWriter {
  set(name: string, key: string, value: unknown): Promise<void> | void;
}

/** `'positions.asOfDate'` → `{ name, key }`; `null` for anything malformed. */
function parseRef(ref: string | undefined): { name: string; key: string } | null {
  if (!ref) return null;
  const dot = ref.indexOf('.');
  // `<= 0` on purpose: a leading dot names no provider.
  if (dot <= 0) return null;
  const key = ref.slice(dot + 1);
  if (!key) return null;
  return { name: ref.slice(0, dot), key };
}

/**
 * The persisted historical date, or `null` when the ref is absent/malformed,
 * the entry is unset, or the stored value is not a PAST date. The last guard
 * is what stops a stale "today" in AppData from restoring a grid into
 * historical mode showing live data.
 */
export function readHistoricalDateFromAppData(
  ref: string | undefined,
  store: HistoricalDateReader,
): string | null {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  const value = store.get(parsed.name, parsed.key);
  if (typeof value !== 'string' || !isHistoricalToolbarDate(value)) return null;
  return value;
}

/**
 * Write-through. Resolves `false` when there was nowhere to write, so a caller
 * that must not proceed without the value landing can tell "wrote it" from "no
 * ref configured"; a failing write REJECTS rather than resolving false, which
 * is what lets the reload path report it and abort.
 */
export async function writeHistoricalDateToAppData(
  ref: string | undefined,
  store: HistoricalDateWriter,
  isoDate: string,
): Promise<boolean> {
  const parsed = parseRef(ref);
  if (!parsed) return false;
  await store.set(parsed.name, parsed.key, isoDate);
  return true;
}
