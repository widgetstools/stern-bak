/** Icon metadata for dock/registry editors — ported from @wellsfargo-starui/icons-svg index. */

export type IconCategory = 'trading' | 'blotters' | 'charts' | 'risk' | 'general' | 'system';

export interface IconMeta {
  name: string;
  category: IconCategory;
}

export type MarketIconName = string;

export const ICON_CATEGORY_NAMES = ['trading', 'blotters', 'charts', 'risk', 'general', 'system'] as const;

/** Minimal metadata map — keys match MARKET_ICON_SVGS in allIcons.ts */
export const ICON_META: Record<string, IconMeta> = {
  settings: { name: 'Settings', category: 'system' },
  refresh: { name: 'Refresh', category: 'system' },
  code: { name: 'Code', category: 'system' },
  download: { name: 'Download', category: 'system' },
  upload: { name: 'Upload', category: 'system' },
  sun: { name: 'Sun', category: 'system' },
  moon: { name: 'Moon', category: 'system' },
  eye: { name: 'Eye', category: 'system' },
  'trade-blotter': { name: 'Trade Blotter', category: 'blotters' },
  blotter: { name: 'Blotter', category: 'blotters' },
};

export const ICON_NAMES = Object.keys(ICON_META) as MarketIconName[];

export const ICON_CATEGORIES: Record<IconCategory, MarketIconName[]> = {
  trading: [],
  blotters: ICON_NAMES.filter((n) => ICON_META[n]?.category === 'blotters'),
  charts: [],
  risk: [],
  general: [],
  system: ICON_NAMES.filter((n) => ICON_META[n]?.category === 'system'),
};

export function getIconsByCategory(category: IconCategory): MarketIconName[] {
  return ICON_CATEGORIES[category] ?? [];
}
