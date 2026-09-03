/**
 * Client for the server-side NLP backend (`server/nlp/`, FastAPI).
 *
 * The server does the same job as the local classifier with a real model
 * behind it (zero-shot intent + NER). It's optional: when it's unreachable the
 * assistant runs on the local pipeline alone.
 */
import type { AssistantIntent } from './intentClassifier';
import type { ExtractedEntities, CatalogueColumn } from './entityExtractor';

export interface ServerParseRequest {
  text: string;
  columns: CatalogueColumn[];
  /** Recent turns, oldest first, for coreference ("now sort that by yield"). */
  history?: string[];
}

export interface ServerParseResponse {
  intent: AssistantIntent;
  confidence: number;
  entities: ExtractedEntities;
  /** Model that produced this — surfaced in the transcript's debug line. */
  model: string;
  latencyMs: number;
}

export const DEFAULT_NLP_URL = 'http://127.0.0.1:8100';

export async function serverHealthy(baseUrl = DEFAULT_NLP_URL, timeoutMs = 1500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function parseOnServer(
  req: ServerParseRequest,
  baseUrl = DEFAULT_NLP_URL,
  timeoutMs = 8000,
): Promise<ServerParseResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`NLP server ${res.status}: ${await res.text()}`);
    return (await res.json()) as ServerParseResponse;
  } finally {
    clearTimeout(t);
  }
}
