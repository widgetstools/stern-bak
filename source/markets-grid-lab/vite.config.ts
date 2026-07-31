import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '@wellsfargo-starui/platform/scripts/staruiConsumerVite.mjs';

export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url), { worker: true }), {
    plugins: [react()],
    server: { port: 5300, open: true },
    assetsInclude: ['**/*.md'],
  }),
);
