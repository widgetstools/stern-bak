/**
 * Default SharedWorker entry for `@wellsfargo-starui/data`.
 *
 * All the actual boot logic (bootstrap handshake, port capture, ConfigManager
 * construction, hub install) lives in `bootWorker.ts`, shared with
 * `perspectiveEntry.ts`. This file is just the "default" choice of hub
 * options — none — bundled as its own esbuild entry point
 * (`scripts/buildWorker.mjs`) so apps that never touch Perspective keep
 * loading the smaller of the two worker assets.
 *
 * Apps that need bespoke worker setup should keep their own worker file and
 * call `installSharedWorkerHub({...})` directly.
 */

import { bootDefaultWorker } from './bootWorker.js';

bootDefaultWorker().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/data worker] boot failed', err);
  throw err;
});
