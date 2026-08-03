/**
 * Bundler asset imports.
 *
 * `?url` is a Vite suffix, not a TypeScript one, so `tsc` needs to be told the
 * shape. Apps can consume this bucket as SOURCE (see `docs/APPS_REPO.md` on the
 * consumer aliases), so the suffix has to survive their build too — every app
 * on this path is Vite, which is what makes the wasm a separately-cacheable
 * asset instead of 5 MB of base64 inside a JS chunk.
 */
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
