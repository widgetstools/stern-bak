const MAG = { k: 1e3, m: 1e6, b: 1e9 } as const;

/** Parse trader shorthand like `1.5M`, `250k`, or plain numbers. */
export function parseMagnitudeSuffix(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = m[2]?.toLowerCase() as keyof typeof MAG | undefined;
  return suffix ? base * MAG[suffix] : base;
}
