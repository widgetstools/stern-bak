// Post-build dist finalizer — copies src/**/*.css into dist (same relative
// paths; the exported styles.css / styles/*.css targets live there) and
// rewrites extensionless relative specifiers in emitted JS/.d.ts so external
// (non-Vite) consumers can resolve the dist build.
import { finalizeDist } from '../../../../scripts/packageDistFinalize.mjs';

finalizeDist(new URL('..', import.meta.url), { copyCss: true });
