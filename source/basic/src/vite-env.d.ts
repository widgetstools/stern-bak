/// <reference types="vite/client" />

// The platform repo ships this Vite helper as plain .mjs with JSDoc only —
// no emitted declarations — so tsc needs this ambient module. Signatures
// mirror @wellsfargo-starui/platform scripts/staruiConsumerVite.mjs (and
// appDirFromConfig in scripts/staruiConsumerAliases.mjs).
declare module '@wellsfargo-starui/platform/scripts/staruiConsumerVite.mjs' {
  import type { UserConfig } from 'vite';

  /** Derive the app root dir from the calling vite.config's `import.meta.url`. */
  export function appDirFromConfig(configUrl: string): string;

  /**
   * Shared Vite partial config for apps consuming `@wellsfargo-starui/*`.
   * Pass `{ worker: true }` when the app uses SharedWorker.
   */
  export function staruiConsumerViteConfig(
    appDir: string,
    opts?: { worker?: boolean },
  ): UserConfig;
}
