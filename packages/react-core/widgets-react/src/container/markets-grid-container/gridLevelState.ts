export type ProviderMode = 'live' | 'historical';

/** Persisted picker state — lives inside {@link GridLevelStateV1}. */
export interface ProviderSelection {
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderMode;
}

export const DEFAULT_PROVIDER_SELECTION: ProviderSelection = {
  liveProviderId: null,
  historicalProviderId: null,
  mode: 'live',
};

/** Grid-level persisted state (survives profile switches). */
export interface GridLevelStateV1 {
  v: 1;
  provider: ProviderSelection;
  caption?: string;
  /** eventId → handler id (one callback per event) */
  eventBindings?: Record<string, string[]>;
}

export function normalizeProviderSelection(raw: unknown): ProviderSelection {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROVIDER_SELECTION };
  const v = raw as Partial<ProviderSelection>;
  return {
    liveProviderId: typeof v.liveProviderId === 'string' ? v.liveProviderId : null,
    historicalProviderId: typeof v.historicalProviderId === 'string' ? v.historicalProviderId : null,
    mode: v.mode === 'historical' ? 'historical' : 'live',
  };
}

function normalizeEventBindings(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string[]> = {};
  for (const [eventId, handlers] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof handlers === 'string' && handlers.length > 0) {
      out[eventId] = [handlers];
      continue;
    }
    if (!Array.isArray(handlers)) continue;
    const first = handlers.find((h): h is string => typeof h === 'string' && h.length > 0);
    if (first) out[eventId] = [first];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Migrate legacy flat ProviderSelection blob → versioned envelope. */
export function normalizeGridLevelData(raw: unknown): GridLevelStateV1 {
  if (!raw || typeof raw !== 'object') {
    return { v: 1, provider: { ...DEFAULT_PROVIDER_SELECTION } };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.v === 1 && obj.provider && typeof obj.provider === 'object') {
    return {
      v: 1,
      provider: normalizeProviderSelection(obj.provider),
      caption: typeof obj.caption === 'string' ? obj.caption : undefined,
      eventBindings: normalizeEventBindings(obj.eventBindings),
    };
  }
  // Legacy shape: ProviderSelection fields + optional caption at top level
  return {
    v: 1,
    provider: normalizeProviderSelection(raw),
    caption: typeof obj.caption === 'string' ? obj.caption : undefined,
    eventBindings: normalizeEventBindings(obj.eventBindings),
  };
}

export function serializeGridLevelData(state: GridLevelStateV1): GridLevelStateV1 {
  return {
    v: 1,
    provider: { ...state.provider },
    ...(state.caption !== undefined ? { caption: state.caption } : {}),
    ...(state.eventBindings ? { eventBindings: { ...state.eventBindings } } : {}),
  };
}
