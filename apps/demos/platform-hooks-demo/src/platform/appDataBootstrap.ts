import type { AppDataBootstrapHookRegistry } from '@wellsfargo-starui/host-data';

/**
 * AppData bootstrap hooks — ids referenced from public/app-config.json.
 * Runs on the main thread after hub ready (never inside SharedWorker).
 */
export const appDataBootstrapHooks: AppDataBootstrapHookRegistry = {
  'session-context': async (ctx) => {
    await ctx.upsertAppData({
      name: 'SessionContext',
      values: {
        userId: ctx.userId,
        entitlements: ['desk-a', 'desk-b', 'risk-read'],
        loginAt: new Date().toISOString(),
      },
    });
    ctx.log('[bootstrap] session-context', { userId: ctx.userId });
  },

  'desk-defaults': async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    await ctx.upsertAppData({
      name: 'DeskDefaults',
      values: {
        deskId: 'DESK-NYC-1',
        timezone: 'America/New_York',
        currency: 'USD',
      },
    });
    await ctx.upsertAppData({
      name: 'positions',
      values: { asOfDate: today },
    });
    ctx.log('[bootstrap] desk-defaults + positions.asOfDate', { asOfDate: today });
  },
};
