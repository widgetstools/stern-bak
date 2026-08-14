import type { Module } from './types';

/**
 * Options for {@link defineModule}: everything a `Module` accepts, minus
 * the members the helper can default, plus the `initialState` those
 * defaults derive from.
 */
export type DefineModuleOptions<S> = Omit<
  Module<S>,
  'schemaVersion' | 'priority' | 'getInitialState' | 'serialize' | 'deserialize'
> & {
  /** Source of truth for defaults — cloned by every defaulted member. */
  initialState: S;
  /** @default 1 */
  schemaVersion?: number;
  /** @default 100 (mid-band; structure modules run lower, grid-state last at 200) */
  priority?: number;
  getInitialState?(): S;
  serialize?(state: S): unknown;
  deserialize?(raw: unknown): S;
};

/**
 * Builds a {@link Module} with the boilerplate defaulted, so a minimal
 * toggle module is `defineModule({ id, name, category, initialState,
 * SettingsPanel })` and nothing else:
 *
 * - `schemaVersion` → 1
 * - `getInitialState` → structured clone of `initialState`
 * - `serialize` → identity (persist the whole state)
 * - `deserialize` → spread-over-initial (defensive: non-object payloads
 *   reset to initial; missing fields fill from initial)
 * - `migrate` → same additive spread, so a schema-version bump never
 *   silently drops persisted state (the platform's no-`migrate` fallback
 *   discards it)
 *
 * The spread default is only sound for flat-object states; states with
 * required nested shapes or arrays should pass their own `deserialize`.
 * Every default can be overridden by passing the member explicitly.
 */
export function defineModule<S extends object>(opts: DefineModuleOptions<S>): Module<S> {
  const { initialState, ...rest } = opts;
  const spreadOverInitial = (raw: unknown): S =>
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...structuredClone(initialState), ...(raw as Partial<S>) }
      : structuredClone(initialState);

  return {
    schemaVersion: 1,
    priority: 100,
    getInitialState: () => structuredClone(initialState),
    serialize: (state: S) => state,
    deserialize: spreadOverInitial,
    migrate: spreadOverInitial,
    ...rest,
  };
}
