import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig, mergeConfig } from 'vite';
import { staruiConsumerViteConfig, appDirFromConfig } from '@wellsfargo-starui/platform/scripts/staruiConsumerVite.mjs';

const appDir = appDirFromConfig(import.meta.url);
const staruiPartial = staruiConsumerViteConfig(appDir, { worker: true });

export default defineConfig(
  mergeConfig(staruiPartial, {
    plugins: [react(), svgr()],
    server: { port: 5176, host: '127.0.0.1', strictPort: true },
  }),
);
