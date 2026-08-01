import {
  bootstrapDataServicesWithWorkerAsset,
  type DataServices,
} from '@wellsfargo-starui/data/runtime';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

export interface CreateAppDataServicesOpts {
  appName: string;
  userId?: string;
  /**
   * Resolved URL of `@wellsfargo-starui/data/assets/data-services-worker.mjs`
   * from a Vite `?url` import at the app call site.
   */
  /**
   * Worker script URL. OPTIONAL — omit it and the library resolves its own
   * bundled worker entry via `new URL(..., import.meta.url)`, which Vite,
   * webpack, Rollup and Parcel all handle with no consumer config. Pass a
   * URL only for CDN / OpenFin-manifest / plain-<script> hosting.
   */
  workerScriptUrl?: string;
  /** Static REST URL — forwarded to the SharedWorker via scriptURL query param. */
  configServiceRestUrl?: string;
  /** Async resolver (e.g. OpenFin manifest read on the main thread). */
  resolveConfigServiceRestUrl?: () => Promise<string | undefined>;
}

/**
 * One-call app bootstrap for the data-services SharedWorker bundle.
 * Uses the library's esbuild-bundled worker asset — no app-local
 * `sharedWorker/entry.ts` required.
 */
export async function createAppDataServices(
  opts: CreateAppDataServicesOpts,
): Promise<DataServices> {
  const configServiceRestUrl =
    opts.configServiceRestUrl ??
    (opts.resolveConfigServiceRestUrl
      ? await opts.resolveConfigServiceRestUrl()
      : undefined);

  return bootstrapDataServicesWithWorkerAsset(opts.workerScriptUrl, {
    appName: opts.appName,
    userId: opts.userId ?? LOGGED_IN_USER_ID,
    configServiceRestUrl,
  });
}
