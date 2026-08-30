import { defineConfig } from 'vite';

// Standalone benchmark app: deliberately NOT wired through the platform's
// consumer aliases — the spike measures the Perspective engine in
// isolation, before any hub integration.
export default defineConfig({
  server: { port: 5214, open: false, strictPort: true },
  // hub.worker.ts is a module SharedWorker (it imports the engine shim +
  // the inline client); keep ESM output for it.
  worker: { format: 'es' },
  optimizeDeps: {
    // The inline build carries the engine WASM + worker as embedded
    // assets; pre-bundling would re-process ~6MB for nothing.
    exclude: ['@perspective-dev/client'],
  },
});
