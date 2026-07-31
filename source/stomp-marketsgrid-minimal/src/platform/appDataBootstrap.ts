import type { AppDataBootstrapHookRegistry } from '@wellsfargo-starui/host-data';

/**
 * Platform AppData bootstrap hooks for stomp-marketsgrid-minimal.
 *
 * Hook ids are referenced from `public/app-config.json` → `appDataBootstrap`.
 * Runs on the main thread after the SharedWorker hub is ready — never in the worker.
 */
export const appDataBootstrapHooks: AppDataBootstrapHookRegistry = {
  'session-context': async (ctx) => {
    await ctx.upsertAppData({
      name: 'SessionContext',
      values: {
        userId: ctx.userId,
        entitlements: ['desk-a', 'desk-b'],
        // Initial/default as-of-date (today) seeded into AppData. STOMP
        // `{{...asofdate}}` templates resolve against this until the user
        // picks a date in the toolbar — at which point the historical
        // restart overlay `{ asOfDate }` overrides it (the overlay wins
        // for any historical date key; see stomp.ts lookupWithRestartOverlay).
        'position-asofdate': new Date().toISOString().slice(0, 10),
      },
    });
    ctx.log('seeded SessionContext', { userId: ctx.userId });
  },
};
