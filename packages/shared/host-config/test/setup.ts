/**
 * Vitest setup for `@wellsfargo-starui/host-config`.
 *
 * Installs the in-process IndexedDB shim BEFORE any test file imports
 * Dexie. jsdom 29 ships no IndexedDB; without this shim every Dexie
 * test crashes with `ReferenceError: indexedDB is not defined` (or
 * `Dexie.DexieError: PrematureCommitError` once Dexie 4 attempts a
 * lazy global lookup).
 */
import 'fake-indexeddb/auto';
