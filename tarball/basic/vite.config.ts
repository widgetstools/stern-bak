import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * TARBALL TRACK — deliberately plain.
 *
 * No `staruiConsumerViteConfig`, no aliases, no platform-repo imports. This app
 * installs @wellsfargo-starui/* as ordinary npm packages, so it is the honest
 * test of the "install the package, import one stylesheet, done" contract in
 * the platform repo's docs/EXTERNAL_CONSUMPTION.md. If this file ever needs
 * platform helpers in order to build, external consumption is broken and the
 * packages need the fix — not this config.
 *
 * The single documented exception is the optimizeDeps entry below, which only
 * affects `vite dev`.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5294 },
  optimizeDeps: {
    // Vite dev prebundles bare node_modules imports into .vite/deps/, which
    // relocates the module and breaks the SharedWorker's
    // `new URL(..., import.meta.url)` resolution. A package cannot opt itself
    // out of the optimizer, so consumers add this one line. `vite build` and
    // every other bundler need nothing.
    exclude: ['@wellsfargo-starui/host-data'],
  },
});
