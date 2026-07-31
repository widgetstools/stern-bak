/**
 * Minimal ambient typing for the OpenFin runtime's `globalThis.fin`.
 *
 * Scope: ONLY the surface this package actually touches. The full
 * `@openfin/core` typings are huge and react-grid intentionally has
 * no dependency on that package — `openfinViewProfile.ts` is the
 * only consumer here and uses just two methods on `fin.me` to
 * round-trip `customData.activeProfileId` through workspace
 * save/restore (see docs/PROFILE_PERSISTENCE.md § 3).
 *
 * If a second consumer needs richer OpenFin surface inside react-grid,
 * extend this file rather than reintroducing `(globalThis as any).fin`
 * casts at the call site.
 */

interface ReactGridOpenFinViewOptions {
  customData?: Record<string, unknown>;
}

interface ReactGridOpenFinMe {
  getOptions(): Promise<ReactGridOpenFinViewOptions>;
  updateOptions(opts: Partial<ReactGridOpenFinViewOptions>): Promise<void>;
}

interface ReactGridOpenFinRuntime {
  me?: ReactGridOpenFinMe;
}

declare global {
  // eslint-disable-next-line no-var
  var fin: ReactGridOpenFinRuntime | undefined;
}

export {};
