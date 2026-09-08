/**
 * Client for the fixed-income trading service's scenario surface.
 *
 * The service is a separate origin — the same arrangement `llmClient.ts`
 * already has with a local model server — so this follows that shape
 * deliberately: a base URL the user can edit, a health probe behind a
 * connection dot, and no assumption that the thing is running. When it is not,
 * the tools say so in a sentence a model can act on rather than throwing.
 *
 * Nothing here computes. The service owns the book and the factor model; a
 * request names a horizon and a world count and gets an answer back. No rows
 * cross this boundary in either direction, which is why a scan of 70,000
 * positions costs the same over the wire as a scan of ten.
 */

const LOG = '[scenario]';
const DEFAULT_BASE_URL = 'http://127.0.0.1:8081';
const REQUEST_TIMEOUT_MS = 60_000;

export const SCENARIO_BASE_URL_KEY = 'starui.scenario.baseUrl';

export function defaultScenarioBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

export interface BookSummary {
  fingerprint: string;
  asOf: number;
  positionCount: number;
  marketValue: number;
  byAssetClass: { assetClass: string; positions: number; marketValue: number }[];
}

export interface BucketContribution {
  bucket: string;
  pnl: number;
  share: number;
}

export interface PositionContribution {
  positionId: string;
  description: string;
  bucket: string;
  pnl: number;
}

export interface WorstWorld {
  worldIndex: number;
  terminalPnl: number;
  worstPnl: number;
  worstOnDay: number;
  downgrades: number;
  creditJumps: number;
  tenYearFrom: number;
  tenYearTo: number;
  creditFrom: number;
  creditTo: number;
  byBucket: BucketContribution[];
  worstPositions: PositionContribution[];
}

export interface ScanResponse {
  bookFingerprint: string;
  positionCount: number;
  baseMarketValue: number;
  worlds: number;
  horizonDays: number;
  terminalPnl: number[];
  mean: number;
  median: number;
  var95: number;
  cvar95: number;
  best: number;
  worst: number;
  worstWorlds: WorstWorld[];
  plausibility: string;
  elapsedMs: number;
  revaluation: string;
  distribution: { from: number; to: number; count: number }[];
}

export interface WorstMoveResponse {
  bookFingerprint: string;
  horizonDays: number;
  radius: number;
  move: { level: number; slope: number; curvature: number; hump: number; credit: number };
  predictedPnl: number;
  actualPnl: number;
  convexityEffect: number;
  tenYearMoveBp: number;
  creditWideningPct: number;
  exposure: { gradient: number[]; standaloneLoss: number[]; labels: string[] };
  byBucket: BucketContribution[];
  worstPositions: PositionContribution[];
  explanation: string;
  plausibility: string;
}

export interface ForkResponse {
  name: string;
  bookFingerprint: string;
  actual: { median: number; worst: number; worstWorlds: WorstWorld[] };
  counterfactual: { median: number; worst: number; worstWorlds: WorstWorld[] };
  difference: { median: number; worst: number };
  plausibility: string;
}

function root(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/**
 * The service unreachable is an ordinary outcome, not an exception.
 *
 * A thrown error would surface to the model as a tool failure with a stack in
 * it; a sentence naming the URL and the command to start the service is
 * something it can relay to the user, and something the user can act on.
 */
export class ScenarioServiceError extends Error {
  constructor(message: string, readonly baseUrl: string) {
    super(message);
    this.name = 'ScenarioServiceError';
  }
}

async function request<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
  const url = `${root(baseUrl)}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({ error: response.statusText }));
      throw new ScenarioServiceError(
        `The scenario service rejected the request: ${(detail as { error?: string }).error ?? response.statusText}`,
        baseUrl,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ScenarioServiceError) throw error;
    const reason = (error as { name?: string }).name === 'AbortError'
      ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : 'is not reachable';
    console.debug(`${LOG} ${url} → ${reason}`, error);
    throw new ScenarioServiceError(
      `The fixed-income trading service at ${baseUrl} ${reason}. ` +
        'Start it with `npm run dev` in apps/source/fi-trading-service, or point the assistant ' +
        'at a different URL in its settings.',
      baseUrl,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function checkScenarioHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${root(baseUrl)}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function fetchBookSummary(baseUrl: string): Promise<BookSummary> {
  return request<BookSummary>(baseUrl, '/api/book/summary');
}

export interface ScanRequest {
  worlds?: number;
  horizonDays?: number;
  reportWorst?: number;
  shock?: {
    level?: number;
    slope?: number;
    curvature?: number;
    credit?: number;
    volMultiplier?: number;
    onDay?: number;
  };
}

export function runScan(baseUrl: string, body: ScanRequest): Promise<ScanResponse> {
  return request<ScanResponse>(baseUrl, '/api/scenario/scan', body);
}

export function findWorstMove(
  baseUrl: string, body: { horizonDays?: number; radius?: number },
): Promise<WorstMoveResponse> {
  return request<WorstMoveResponse>(baseUrl, '/api/scenario/worst', body);
}

export function forkMarket(
  baseUrl: string, body: ScanRequest & { name?: string },
): Promise<ForkResponse> {
  return request<ForkResponse>(baseUrl, '/api/scenario/fork', body);
}
