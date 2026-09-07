import { config as loadDotenv } from 'dotenv';

import { bootstrap } from './bootstrap.js';
import { loadConfig } from './config.js';

loadDotenv();

const service = await bootstrap(loadConfig());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    service.logger.info(`${signal} received, shutting down`);
    void service.close().then(() => process.exit(0));
  });
}
