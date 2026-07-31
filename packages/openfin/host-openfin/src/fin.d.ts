/**
 * Minimal `fin` global declaration for the runtime-openfin package.
 *
 * `@openfin/core` ships its own type-side-effect declaration but pulling
 * the full triple-slash reference into a foundation-ish package would tie
 * the build to OpenFin's types being installed. We declare only the
 * surface we use, so consumers without `@openfin/core` installed still
 * get a clean typecheck.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin: any;
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fin: any;
  }
}

export {};
