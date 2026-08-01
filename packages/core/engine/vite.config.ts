import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'StarGridEngine',
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        '@wellsfargo-starui/types',
        'ag-grid-community',
        'ag-grid-enterprise',
        'ag-grid-react',
        'ssf',
        'zustand',
      ],
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Self-imports in src/ use the package name; map to source during the lib build.
      '@wellsfargo-starui/core': resolve(__dirname, 'src/index.ts'),
    },
  },
});
