/** REST client for the SPG pricing server (see `server/server.mjs`). */

export const SPG_SERVER_URL = 'http://localhost:8091';

export interface UpdateResult {
  cusip: string;
  ok: boolean;
  fields?: string[];
  error?: string;
}

export interface ServerPosition extends Record<string, unknown> {
  cusip: string;
  price: number;
  priorPrice: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SPG_SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Commit edited fields. Resolves AFTER the server's ack delay — the pending window. */
export function postUpdates(
  updates: Array<{ cusip: string; fields: Record<string, unknown> }>,
): Promise<{ results: UpdateResult[] }> {
  return post('/api/updates', { updates });
}

/** CSV-import validation: which cusips exist, with their CURRENT server rows. */
export function lookupPositions(
  cusips: string[],
): Promise<{ found: ServerPosition[]; missing: string[] }> {
  return post('/api/lookup', { cusips });
}

export async function serverHealth(): Promise<{ rows: number; ackDelayMs: number } | null> {
  try {
    const res = await fetch(`${SPG_SERVER_URL}/health`);
    if (!res.ok) return null;
    return (await res.json()) as { rows: number; ackDelayMs: number };
  } catch {
    return null;
  }
}
