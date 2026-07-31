// Post-build dist finalizer — rewrites extensionless relative specifiers in
// emitted JS/.d.ts so external (non-Vite) consumers can resolve the dist
// build. SVGs are NOT copied: the "./svg/*" wildcard export ships the
// package-root svg/ directory directly.
import { finalizeDist } from '../../../../scripts/packageDistFinalize.mjs';

finalizeDist(new URL('..', import.meta.url));
