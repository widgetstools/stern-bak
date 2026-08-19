/**
 * REST write-through and pending-sync drain for {@link ConfigManager}.
 */
import type { ConfigDatabase } from './db';
import { OptimisticLockError } from './errors';
import type { AppConfigRow, AppIdentity, PendingSyncRow } from './types';
import { MAX_SYNC_RETRIES } from './configManagerInternals';

export interface ConfigManagerRestSyncContext {
  db: ConfigDatabase;
  restUrl: string | undefined;
  identity: AppIdentity;
}

export async function syncToRest(
  ctx: ConfigManagerRestSyncContext,
  operation: 'upsert' | 'delete',
  tableName: string,
  recordId: string,
  payload: unknown,
  options?: { ifMatch?: string },
): Promise<void> {
  if (!ctx.restUrl) {
    return;
  }

  try {
    const url = `${ctx.restUrl}/${tableName}/${recordId}`;
    const method = operation === 'delete' ? 'DELETE' : 'PUT';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ctx.identity.getAccessToken) {
      const token = await ctx.identity.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (options?.ifMatch !== undefined) {
      headers['If-Match'] = options.ifMatch;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: operation === 'delete' ? undefined : JSON.stringify(payload),
    });

    if (response.status === 412) {
      let currentRow: AppConfigRow | undefined;
      try {
        currentRow = (await response.json()) as AppConfigRow;
      } catch {
        currentRow = undefined;
      }
      throw new OptimisticLockError(currentRow);
    }

    if (!response.ok) {
      throw new Error(`REST sync failed with HTTP ${response.status}`);
    }
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      throw error;
    }

    console.warn(
      `ConfigManager: REST sync failed for ${operation} ${tableName}/${recordId}. Queuing for retry.`,
      error,
    );

    const pendingEntry: PendingSyncRow = {
      operation,
      tableName,
      recordId,
      payload,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    await ctx.db.pendingSync.add(pendingEntry);
  }
}

export async function drainPendingSync(ctx: ConfigManagerRestSyncContext): Promise<void> {
  if (!ctx.restUrl) {
    return;
  }

  const pendingEntries = await ctx.db.pendingSync.toArray();
  if (pendingEntries.length === 0) {
    return;
  }

  console.log(`ConfigManager: Draining ${pendingEntries.length} pending sync entries.`);

  for (const entry of pendingEntries) {
    if (entry.id === undefined) {
      console.warn('ConfigManager: Skipping pending sync entry with no id.', entry);
      continue;
    }

    if (entry.retries >= MAX_SYNC_RETRIES) {
      console.error(
        `ConfigManager: Giving up on sync for ${entry.tableName}/${entry.recordId} after ${entry.retries} retries.`,
      );
      continue;
    }

    try {
      const url = `${ctx.restUrl}/${entry.tableName}/${entry.recordId}`;
      const method = entry.operation === 'delete' ? 'DELETE' : 'PUT';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ctx.identity.getAccessToken) {
        const token = await ctx.identity.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: entry.operation === 'delete' ? undefined : JSON.stringify(entry.payload),
      });

      if (response.ok) {
        await ctx.db.pendingSync.delete(entry.id);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn('Pending sync retry failed for entry', entry.id, err);
      await ctx.db.pendingSync.update(entry.id, {
        retries: entry.retries + 1,
      });
    }
  }
}
