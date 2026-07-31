#!/usr/bin/env node
/**
 * Launch an OpenFin platform from a manifest URL.
 *
 *   node tools/scripts/launch-openfin.mjs http://localhost:5190/openfin/manifest.json
 *
 * Used by the root `dev:openfin` script, but can be invoked directly
 * against any manifest URL (handy for smoke-testing stern-reference or
 * a scaffolded `tradingAppN`). Adapted from
 * `apps/markets-ui-react-reference/launch.mjs`; generalized so the
 * default URL is the demo-react manifest.
 *
 * Runs on every platform OpenFin supports (Windows + macOS). The
 * @openfin/node-adapter is a regular devDependency on the root —
 * `npm ci` installs it everywhere — so the import below is dynamic
 * only to surface a clear, actionable error if a developer ran the
 * install with --no-optional or otherwise pruned it.
 */
import { setDefaultResultOrder } from 'node:dns';

async function main() {
  const { connect, launch } = await import('@openfin/node-adapter').catch((err) => {
    console.error('[openfin] @openfin/node-adapter not installed:', err.message);
    process.exit(1);
  });

  const DEFAULT_MANIFEST = 'http://localhost:5190/openfin/manifest.json';

  async function launchFromNode(manifestUrl) {
    console.log(`[openfin] launching manifest: ${manifestUrl}`);
    try {
      const port = await launch({ manifestUrl });
      const fin = await connect({
        uuid: `mui-dev-${Date.now()}`,
        address: `ws://127.0.0.1:${port}`,
        nonPersistent: true,
      });
      fin.once('disconnected', () => {
        console.log('[openfin] platform disconnected — exiting');
        process.exit();
      });
      return fin;
    } catch (e) {
      console.error('[openfin] failed to launch manifest');
      console.error(e?.message ?? e);
      if (String(e?.message ?? '').includes('Could not locate')) {
        console.error('[openfin] is the dev server up and the manifest JSON valid?');
      }
      throw e;
    }
  }

  async function run(manifestUrl) {
    let quitRequested = false;
    let quit = async () => {};

    const fin = await launchFromNode(manifestUrl);
    if (!fin) return;

    const manifest = await fin.System.fetchManifest(manifestUrl);

    if (manifest.platform?.uuid) {
      const uuid = manifest.platform.uuid;
      console.log(`[openfin] wrapped platform: ${uuid}`);
      quit = async () => {
        if (quitRequested) return;
        quitRequested = true;
        try {
          const platform = fin.Platform.wrapSync({ uuid });
          await platform.quit();
        } catch (err) {
          if (String(err).includes('no longer connected')) process.exit();
          else console.error('[openfin] quit error:', err);
        }
      };
    } else {
      const uuid = manifest.startup_app.uuid;
      console.log(`[openfin] wrapped classic app: ${uuid}`);
      quit = async () => {
        if (quitRequested) return;
        quitRequested = true;
        try {
          const app = fin.Application.wrapSync({ uuid });
          await app.quit();
        } catch (err) {
          console.error('[openfin] quit error:', err);
        }
      };
    }

    process.on('exit', () => { void quit(); });
    process.on('SIGINT', () => { console.log('[openfin] Ctrl+C'); void quit(); });
    process.on('SIGTERM', () => { void quit(); });

    console.log(`[openfin] connected — press Ctrl+C to exit`);
  }

  // ── Entry ───────────────────────────────────────────────────────────
  try { setDefaultResultOrder('ipv4first'); } catch { /* old node */ }

  const manifestUrl = process.argv[2] ?? DEFAULT_MANIFEST;
  await run(manifestUrl).catch((err) => {
    console.error('[openfin]', err?.message ?? err);
    process.exit(1);
  });
}

// Start the main entry point
(async () => {
  try {
    await main();
  } catch (err) {
    console.error('[openfin] fatal error:', err?.message ?? err);
    process.exit(1);
  }
})();
