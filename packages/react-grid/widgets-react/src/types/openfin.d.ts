/**
 * OpenFin global type — minimal structural declaration.
 *
 * Previously imported `@openfin/core` for precise types, but per
 * `docs/ARCHITECTURE.md`'s import-boundary rules `widgets-react`
 * (a framework-adapter layer) shouldn't depend on the OpenFin SDK
 * directly — only `runtime-openfin` and `apps/*` should. We drop the
 * precise type for an `any`-typed global so the few `fin.*` calls in
 * `widgets-react/src/hooks/openfin/` keep compiling without pulling
 * `@openfin/core` into the framework layer.
 *
 * The same shape lives at `packages/runtime-openfin/src/fin.d.ts`. If
 * widgets-react ever needs richer types, the right move is to import
 * a typed wrapper from a future `@wellsfargo-starui/core/host`-shaped
 * package, not to add `@openfin/core` back.
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
