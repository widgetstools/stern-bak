/**
 * Shared Vite partial config for apps consuming @wellsfargo-starui/* packages.
 */
import {
  staruiViteAliases,
  staruiOptimizeDeps,
  staruiServerFsAllow,
  reactResolveConfig,
  appDirFromConfig,
  staruiHostDataWorkerAssetPlugin,
  staruiEnsureBuiltAssetsPlugin,
  stompJsEsmAlias,
} from './staruiConsumerAliases.mjs';

export { appDirFromConfig };

/**
 * @param {string} appDir absolute path to the app root
 * @param {{ worker?: boolean }} [opts] pass `{ worker: true }` when the app uses SharedWorker
 */
export function staruiConsumerViteConfig(appDir, opts = {}) {
  const reactResolve = reactResolveConfig(appDir);

  return {
    plugins: [staruiEnsureBuiltAssetsPlugin(), staruiHostDataWorkerAssetPlugin(appDir)],
    optimizeDeps: {
      ...reactResolve.optimizeDeps,
      ...staruiOptimizeDeps(),
      include: [
        ...(reactResolve.optimizeDeps.include ?? []),
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
      ],
    },
    resolve: {
      dedupe: reactResolve.dedupe,
      alias: [stompJsEsmAlias(appDir), ...reactResolve.alias, ...staruiViteAliases(appDir)],
      extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    },
    server: {
      fs: {
        allow: staruiServerFsAllow(appDir),
      },
    },
    ...(opts.worker ? { worker: { format: 'es' } } : {}),
    build: {
      // ag-grid-enterprise is the largest remaining vendor chunk. (The
      // former 4500 limit existed for monaco-editor, which the expression
      // editor no longer uses — CodeMirror lands ~380 KB lazily.)
      chunkSizeWarningLimit: 2600,
      // Reporting gzip sizes re-compresses every emitted chunk; on the
      // multi-MB ag-grid bundles that is a measurable chunk of build time
      // for output we don't act on. Skip it.
      reportCompressedSize: false,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          if (warning.code === 'SOURCEMAP_ERROR') return;
          defaultHandler(warning);
        },
        output: {
          // Pull the big vendor libraries out of the main app chunk into
          // their own cacheable chunks. Shrinks the entry bundle, lowers
          // peak minifier memory, and keeps them cached across rebuilds.
          // App-agnostic: a no-op for apps that don't pull them in.
          manualChunks(id) {
            if (id.includes('node_modules/ag-grid-enterprise')) return 'ag-grid-enterprise';
            if (id.includes('node_modules/ag-grid-community')) return 'ag-grid-community';
            if (id.includes('node_modules/ag-grid-react')) return 'ag-grid-react';
            return undefined;
          },
        },
      },
    },
  };
}
