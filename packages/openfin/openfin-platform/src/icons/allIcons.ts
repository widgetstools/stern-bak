/**
 * All custom market icon SVG strings.
 *
 * Auto-generated from svg/*.svg files.
 * Each SVG uses stroke="currentColor" so the color can be replaced at runtime.
 * Used by dock editor icon pickers in both React and Angular.
 */

export const MARKET_ICON_SVGS: Record<string, string> = {
  "alert": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  "allocation-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Fork/split icon in header -->
  <line x1="11" y1="3.8" x2="11" y2="5" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.9"/>
  <line x1="11" y1="5" x2="9" y2="6.5" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.9"/>
  <line x1="11" y1="5" x2="13" y2="6.5" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: label + progress bar (80%) -->
  <line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="9" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="9" width="9.6" height="2" rx="1" fill="currentColor" opacity="0.5"/>
  <!-- Row 2: label + progress bar (50%) -->
  <line x1="4" y1="14.5" x2="7" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="13.5" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="13.5" width="6" height="2" rx="1" fill="currentColor" opacity="0.4"/>
  <!-- Row 3: label + progress bar (25%) -->
  <line x1="4" y1="19" x2="6.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="18" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="18" width="3" height="2" rx="1" fill="currentColor" opacity="0.3"/>
</svg>`,
  "analytics": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Bar chart columns (ascending) -->
  <rect x="4" y="14" width="3.5" height="7" rx="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <rect x="10" y="10" width="3.5" height="11" rx="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <rect x="16" y="6" width="3.5" height="15" rx="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Trend line going up -->
  <polyline points="5.5,13 11.5,9 17.5,5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Plus icon at the peak -->
  <line x1="17.5" y1="2.5" x2="17.5" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
  <line x1="16" y1="4" x2="19" y2="4" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
</svg>`,
  "area-chart": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L7 12 L11 15 L15 7 L19 10 L21 4 L21 20 Z" fill="currentColor" opacity="0.2"/><polyline points="3 20 7 12 11 15 15 7 19 10 21 4"/></svg>`,
  "audit-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Lock icon in header -->
  <rect x="9.5" y="4.5" width="3" height="2.2" rx="0.5" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.9"/>
  <path d="M10.3,4.5 L10.3,3.8 Q10.3,3.2 11,3.2 Q11.7,3.2 11.7,3.8 L11.7,4.5" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" fill="none" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="7" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="7" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Timeline dots along left side -->
  <circle cx="5" cy="10" r="1.2" fill="currentColor" opacity="1"/>
  <circle cx="5" cy="14.5" r="1.2" fill="currentColor" opacity="0.5"/>
  <circle cx="5" cy="19" r="1.2" fill="currentColor" opacity="0.3"/>
  <!-- Connecting lines between dots -->
  <line x1="5" y1="11.2" x2="5" y2="13.3" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.3"/>
  <line x1="5" y1="15.7" x2="5" y2="17.8" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.2"/>
  <!-- Row 1 data -->
  <line x1="8" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2 data -->
  <line x1="8" y1="14.5" x2="13" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3 data -->
  <line x1="8" y1="19" x2="12.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="16" y1="19" x2="19" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "bank": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><line x1="6" y1="10" x2="6" y2="21"/><line x1="10" y1="10" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="21"/><line x1="18" y1="10" x2="18" y2="21"/></svg>`,
  "bar-chart": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="8"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="2" width="4" height="18"/><line x1="1" y1="20" x2="23" y2="20"/></svg>`,
  "block-trade-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Block square in header -->
  <rect x="9.5" y="3.8" width="3" height="2.8" rx="0.4" stroke="currentColor" stroke-width="0.8" fill="currentColor" opacity="0.4"/>
  <!-- Row separators -->
  <line x1="3" y1="12.5" x2="21" y2="12.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: thick block row (large notional) -->
  <rect x="4" y="8" width="16.5" height="3.5" rx="0.5" fill="currentColor" opacity="0.15"/>
  <line x1="5" y1="9.8" x2="9" y2="9.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="1"/>
  <line x1="11" y1="9.8" x2="15" y2="9.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="16.5" y1="9.8" x2="19.5" y2="9.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: thick block row -->
  <rect x="4" y="13" width="16.5" height="3.2" rx="0.5" fill="currentColor" opacity="0.1"/>
  <line x1="5" y1="14.6" x2="8.5" y2="14.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <line x1="11" y1="14.6" x2="14.5" y2="14.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="16.5" y1="14.6" x2="19" y2="14.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: thick block row -->
  <rect x="4" y="17.5" width="16.5" height="3" rx="0.5" fill="currentColor" opacity="0.07"/>
  <line x1="5" y1="19" x2="8" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="11" y1="19" x2="15.5" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <line x1="16.5" y1="19" x2="19.5" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  "bond": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Certificate rectangle -->
  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Dollar sign circle -->
  <circle cx="17" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/>
  <path d="M17 6.5v3M16.25 7.25c0-.41.34-.75.75-.75s.75.34.75.75-.34.75-.75.75-.75.34-.75.75.34.75.75.75.75-.34.75-.75" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Text lines -->
  <line x1="6" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="6" y1="11.5" x2="14" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="6" y1="15" x2="11" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <line x1="13" y1="15" x2="18" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "calculator": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="8" y="6" width="8" height="4"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/><line x1="16" y1="18" x2="16" y2="18.01"/></svg>`,
  "candlestick": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Candlestick 1 - Bearish (hollow/outline) -->
  <line x1="5" y1="4" x2="5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="3.5" y="7" width="3" height="7" rx="0.5" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <line x1="5" y1="14" x2="5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Candlestick 2 - Bullish (filled) -->
  <line x1="12" y1="6" x2="12" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <rect x="10.5" y="9" width="3" height="6" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.8"/>
  <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <!-- Candlestick 3 - Bullish (filled, tallest) -->
  <line x1="19" y1="3" x2="19" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <rect x="17.5" y="6" width="3" height="8" rx="0.5" stroke="currentColor" stroke-width="1.5" fill="currentColor"/>
  <line x1="19" y1="14" x2="19" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
</svg>`,
  "cash-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: up arrow (inflow) + data -->
  <line x1="5" y1="11" x2="5" y2="8.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="1"/>
  <polyline points="3.8,9.7 5,8.5 6.2,9.7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="1"/>
  <line x1="8" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="10" x2="20.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: down arrow (outflow) + data -->
  <line x1="5" y1="13" x2="5" y2="15.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
  <polyline points="3.8,14.3 5,15.5 6.2,14.3" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>
  <line x1="8" y1="14.5" x2="13" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: up arrow (inflow) + data -->
  <line x1="5" y1="20.5" x2="5" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <polyline points="3.8,19.2 5,18 6.2,19.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>
  <line x1="8" y1="19" x2="12" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="16" y1="19" x2="19.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "clock": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  "code": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  "commodities-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Droplet icon in header -->
  <path d="M11,3.5 Q11,5.5 9.5,6 Q11,7.5 12.5,6 Q11,5.5 11,3.5Z" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" fill="currentColor" opacity="0.4"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: ticker text + data -->
  <text x="4" y="10.5" font-size="3" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.9">CL</text>
  <line x1="9" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="10" x2="20.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: ticker text + data -->
  <text x="4" y="15" font-size="3" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.7">GC</text>
  <line x1="9" y1="14.5" x2="13" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: ticker text + data -->
  <text x="4" y="19.5" font-size="3" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.5">NG</text>
  <line x1="9" y1="19" x2="12.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="19" x2="19.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "compliance": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Document shape -->
  <path d="M8 2 H16 L20 6 V20 C20 21.1 19.1 22 18 22 H6 C4.9 22 4 21.1 4 20 V4 C4 2.9 4.9 2 6 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Folded corner -->
  <polyline points="16,2 16,6 20,6" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Text lines -->
  <line x1="8" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="8" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Checkmark -->
  <polyline points="9,16.5 11,18.5 15,14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  "counterparty": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Left user silhouette -->
  <circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1.5"/>
  <path d="M3 15 C3 12.8 4.8 11 7 11 C9.2 11 11 12.8 11 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Right user silhouette -->
  <circle cx="17" cy="7" r="2.5" stroke="currentColor" stroke-width="1.5"/>
  <path d="M13 15 C13 12.8 14.8 11 17 11 C19.2 11 21 12.8 21 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Dashed connecting line -->
  <line x1="9.5" y1="7" x2="14.5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="1.5 1.5" opacity="0.5"/>
  <!-- Downward chevrons below -->
  <polyline points="10,18 12,20 14,18" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <polyline points="10,21 12,23 14,21" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
</svg>`,
  "coupon": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Ticket shape with notches -->
  <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5a1.5 1.5 0 1 0 0 3V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4.5a1.5 1.5 0 1 0 0-3V7Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Dashed vertical divider -->
  <line x1="14" y1="6" x2="14" y2="8" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="14" y1="10" x2="14" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="14" y1="14" x2="14" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="14" y1="17" x2="14" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Percentage symbol on left -->
  <circle cx="7.5" cy="10" r="1" stroke="currentColor" stroke-width="1" opacity="0.8"/>
  <circle cx="10" cy="14" r="1" stroke="currentColor" stroke-width="1" opacity="0.8"/>
  <line x1="10" y1="9.5" x2="7.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <!-- Horizontal lines on right -->
  <line x1="16" y1="9.5" x2="19" y2="9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="18" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "credit-rating": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Document -->
  <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Page fold -->
  <path d="M14 3v5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Large A -->
  <path d="M9 17l2.5-8h1l2.5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="9.75" y1="15" x2="14.25" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Plus badge -->
  <circle cx="18" cy="6" r="3" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1"/>
  <line x1="16.5" y1="6" x2="19.5" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="18" y1="4.5" x2="18" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  "currency": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7"/><circle cx="15" cy="15" r="7"/></svg>`,
  "dashboard": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Top-left large rectangle -->
  <rect x="3" y="3" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Top-right small rectangle -->
  <rect x="15" y="3" width="6" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <!-- Bottom-left small rectangle -->
  <rect x="3" y="13" width="6" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <!-- Bottom-center rectangle -->
  <rect x="11" y="13" width="5" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Bottom-right rectangle -->
  <rect x="18" y="13" width="3" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "derivatives-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Options payoff curve in header -->
  <path d="M8,6 L11,6 Q12,6 12,5 L12,3.8" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" fill="none" opacity="0.8"/>
  <path d="M12,6 L15,4" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" fill="none" opacity="0.8"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: delta symbol + data -->
  <text x="4.5" y="10.8" font-size="4.5" font-family="serif" fill="currentColor" opacity="1">&#x3B4;</text>
  <line x1="9" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: gamma symbol + data -->
  <text x="4.5" y="15.3" font-size="4.5" font-family="serif" fill="currentColor" opacity="0.5">&#x3B3;</text>
  <line x1="9" y1="14.5" x2="14" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: theta symbol + data -->
  <text x="4.5" y="19.8" font-size="4.5" font-family="serif" fill="currentColor" opacity="0.3">&#x3B8;</text>
  <line x1="9" y1="19" x2="12" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="19" x2="19" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "download": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  "drawdown": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Area fill below the line -->
  <path d="M4 8 L8 8 L11 9 L14 10 L17 14 L19 19 L19 20 L4 20 Z" fill="currentColor" opacity="0.15"/>
  <!-- Line chart: flat then declining -->
  <polyline points="4,8 8,8 11,9 14,10 17,14 19,19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Downward arrow at the end -->
  <line x1="19" y1="16" x2="19" y2="20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="17,18 19,20 21,18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Axes -->
  <line x1="3" y1="4" x2="3" y2="21" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "duration": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Clock face -->
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
  <!-- Hour hand -->
  <line x1="12" y1="12" x2="12" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Minute hand -->
  <line x1="12" y1="12" x2="15.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Center dot -->
  <circle cx="12" cy="12" r="0.75" fill="currentColor"/>
  <!-- Partial arc segment outside -->
  <path d="M17.5 4.1A9.96 9.96 0 0 1 20.5 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
  <!-- Hour markers -->
  <line x1="12" y1="3.5" x2="12" y2="4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="20.5" y1="12" x2="19.5" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="12" y1="20.5" x2="12" y2="19.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="3.5" y1="12" x2="4.5" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "equity-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: up arrow (buy) + data -->
  <polyline points="5,11 6,9 7,11" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="9" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: down arrow (sell) + data -->
  <polyline points="5,13.5 6,15.5 7,13.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/>
  <line x1="9" y1="14.5" x2="14" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: up arrow (buy) + data -->
  <polyline points="5,19.5 6,17.5 7,19.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.6"/>
  <line x1="9" y1="18.5" x2="12.5" y2="18.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="18.5" x2="19" y2="18.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "execute-trade": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Circle outline -->
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
  <!-- Lightning bolt -->
  <path d="M13 6L9 13h3l-1 5 4-7h-3l1-5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor" opacity="0.15"/>
</svg>`,
  "execution-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Lightning bolt in header -->
  <polyline points="11,3.5 10,5.2 11.5,5.2 10.5,7" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: timestamp text + checkmark -->
  <text x="4" y="10.5" font-size="3" font-family="sans-serif" fill="currentColor" opacity="0.7">09:31</text>
  <line x1="12" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <polyline points="18,10.5 19,11.5 21,9" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="1"/>
  <!-- Row 2: timestamp text + checkmark -->
  <text x="4" y="15" font-size="3" font-family="sans-serif" fill="currentColor" opacity="0.5">10:45</text>
  <line x1="12" y1="14.5" x2="15.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <polyline points="18,15 19,16 21,13.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>
  <!-- Row 3: timestamp text + checkmark -->
  <text x="4" y="19.5" font-size="3" font-family="sans-serif" fill="currentColor" opacity="0.3">14:22</text>
  <line x1="12" y1="19" x2="16.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <polyline points="18,19.5 19,20.5 21,18" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>
</svg>`,
  "exposure-map": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Row 1 (top) -->
  <rect x="4" y="4" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.15"/>
  <rect x="10" y="4" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.2"/>
  <rect x="16" y="4" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.3"/>
  <!-- Row 2 (middle) -->
  <rect x="4" y="10" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.25"/>
  <rect x="10" y="10" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.5"/>
  <rect x="16" y="10" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.65"/>
  <!-- Row 3 (bottom) -->
  <rect x="4" y="16" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.35"/>
  <rect x="10" y="16" width="4" height="4" rx="0.75" fill="currentColor" opacity="0.7"/>
  <rect x="16" y="16" width="4" height="4" rx="0.75" fill="currentColor" opacity="1"/>
</svg>`,
  "eye": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  "fi-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: percentage-like text + data line -->
  <text x="4.5" y="10.5" font-size="3.5" font-family="sans-serif" fill="currentColor" opacity="0.9">5.2%</text>
  <line x1="13" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="18" y1="10" x2="20.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: percentage-like text + data line -->
  <text x="4.5" y="15" font-size="3.5" font-family="sans-serif" fill="currentColor" opacity="0.7">3.8%</text>
  <line x1="13" y1="14.5" x2="16.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="18" y1="14.5" x2="20.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: percentage-like text + data line -->
  <text x="4.5" y="19.5" font-size="3.5" font-family="sans-serif" fill="currentColor" opacity="0.5">4.1%</text>
  <line x1="13" y1="19" x2="18" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="19" y1="19" x2="20.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "fx-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Swap arrows in header -->
  <line x1="9" y1="4.5" x2="13" y2="4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
  <polyline points="12,3.5 13,4.5 12,5.5" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/>
  <line x1="13" y1="5.8" x2="9" y2="5.8" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
  <polyline points="10,4.8 9,5.8 10,6.8" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: currency pair pattern -->
  <text x="4" y="10.5" font-size="3.2" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.9">EUR/USD</text>
  <line x1="16" y1="10" x2="20.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Row 2: currency pair pattern -->
  <text x="4" y="15" font-size="3.2" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.7">GBP/JPY</text>
  <line x1="16" y1="14.5" x2="20.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Row 3: currency pair pattern -->
  <text x="4" y="19.5" font-size="3.2" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.5">USD/CHF</text>
  <line x1="16" y1="19" x2="20.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "globe": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  "heatmap": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="5" fill="currentColor" opacity="0.8"/><rect x="10" y="3" width="5" height="5" fill="currentColor" opacity="0.4"/><rect x="17" y="3" width="5" height="5" fill="currentColor" opacity="0.6"/><rect x="3" y="10" width="5" height="5" fill="currentColor" opacity="0.3"/><rect x="10" y="10" width="5" height="5" fill="currentColor" opacity="0.9"/><rect x="17" y="10" width="5" height="5" fill="currentColor" opacity="0.5"/><rect x="3" y="17" width="5" height="5" fill="currentColor" opacity="0.7"/><rect x="10" y="17" width="5" height="5" fill="currentColor" opacity="0.2"/><rect x="17" y="17" width="5" height="5" fill="currentColor" opacity="0.6"/></svg>`,
  "hedging": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Shield shape -->
  <path d="M12 3 L20 7 V13 C20 17.4 16.4 20.4 12 21.5 C7.6 20.4 4 17.4 4 13 V7 L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Checkmark inside -->
  <polyline points="8.5,12.5 11,15 15.5,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  "interest-rate": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Sine wave -->
  <path d="M2 14C4 14 5 8 8 8S12 14 14 14S17 8 20 8S22 14 22 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  <!-- Upward arrow -->
  <line x1="18" y1="16" x2="18" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="15,7.5 18,5 21,7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Subtle baseline -->
  <line x1="2" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.15"/>
</svg>`,
  "ipo": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12 L12 6 L16 12"/><line x1="12" y1="6" x2="12" y2="18"/></svg>`,
  "limits": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Vertical center line -->
  <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Upper limit dashed line -->
  <line x1="5" y1="7" x2="19" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 2" opacity="0.5"/>
  <!-- Lower limit dashed line -->
  <line x1="5" y1="17" x2="19" y2="17" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 2" opacity="0.5"/>
  <!-- Small rectangle in the center -->
  <rect x="9.5" y="10" width="5" height="4" rx="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  "line-chart": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 20 7 12 11 15 15 7 19 10 21 4"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
  "live-feed": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Line chart path -->
  <polyline points="2,16 5,14 8,15 11,10 14,12 17,7 19,9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Static dot at end -->
  <circle cx="19" cy="9" r="2" fill="currentColor" opacity="0.3"/>
  <circle cx="19" cy="9" r="1" fill="currentColor"/>
  <!-- Pulsing animated circle -->
  <circle cx="19" cy="9" r="2" stroke="currentColor" stroke-width="1" fill="none" opacity="0.6">
    <animate attributeName="r" values="2;5;2" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite"/>
  </circle>
  <!-- Baseline -->
  <line x1="2" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.2"/>
  <!-- Y-axis -->
  <line x1="2" y1="5" x2="2" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.2"/>
</svg>`,
  "market-data": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="7 16 10 10 13 13 17 7"/></svg>`,
  "market-depth": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Stepped staircase - left side ascending -->
  <path d="M2 20H5V16H8V12H11V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  <!-- Peak -->
  <path d="M11 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Stepped staircase - right side descending -->
  <path d="M13 8V12H16V16H19V20H22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  <!-- Fill area -->
  <path d="M2 20H5V16H8V12H11V8H13V12H16V16H19V20H22V20H2Z" fill="currentColor" opacity="0.08"/>
  <!-- Baseline -->
  <line x1="2" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "maturity": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Calendar body -->
  <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Calendar top bar -->
  <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Hangers -->
  <line x1="8" y1="3" x2="8" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="16" y1="3" x2="16" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Date dots -->
  <circle cx="7" cy="12.5" r="0.75" fill="currentColor" opacity="0.3"/>
  <circle cx="10.5" cy="12.5" r="0.75" fill="currentColor" opacity="0.3"/>
  <circle cx="14" cy="12.5" r="0.75" fill="currentColor" opacity="0.3"/>
  <circle cx="17.5" cy="12.5" r="0.75" fill="currentColor" opacity="0.3"/>
  <circle cx="7" cy="16" r="0.75" fill="currentColor" opacity="0.3"/>
  <circle cx="10.5" cy="16" r="0.75" fill="currentColor" opacity="0.3"/>
  <!-- Checkmark on a date -->
  <polyline points="13,16 14.5,17.5 17.5,14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  "moon": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  "notifications": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Bell shape -->
  <path d="M18 8 C18 4.7 15.3 2 12 2 C8.7 2 6 4.7 6 8 C6 14 3 16 3 16 H21 C21 16 18 14 18 8Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Bell clapper -->
  <path d="M10.3 19 C10.5 19.6 11.2 20.5 12 20.5 C12.8 20.5 13.5 19.6 13.7 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Notification badge -->
  <circle cx="17" cy="5" r="2.5" fill="currentColor" opacity="0.8"/>
</svg>`,
  "order-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: filled status circle (complete) + data -->
  <circle cx="5" cy="10" r="1.3" fill="currentColor" opacity="1"/>
  <line x1="8" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: half-filled status circle (partial) + data -->
  <circle cx="5" cy="14.5" r="1.3" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.5"/>
  <path d="M5,13.2 A1.3,1.3 0 0,0 5,15.8" fill="currentColor" opacity="0.5"/>
  <line x1="8" y1="14.5" x2="14" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: empty status circle (pending) + data -->
  <circle cx="5" cy="19" r="1.3" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.3"/>
  <line x1="8" y1="19" x2="12" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15" y1="19" x2="19.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "order-book": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Center divider -->
  <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Buy side (left) - bars from right to left -->
  <rect x="4" y="5" width="7" height="2" rx="0.5" fill="currentColor" opacity="0.8"/>
  <rect x="5.5" y="9" width="5.5" height="2" rx="0.5" fill="currentColor" opacity="0.6"/>
  <rect x="7" y="13" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
  <rect x="8.5" y="17" width="2.5" height="2" rx="0.5" fill="currentColor" opacity="0.25"/>
  <!-- Sell side (right) - bars from left to right -->
  <rect x="13" y="5" width="7" height="2" rx="0.5" fill="currentColor" opacity="0.8"/>
  <rect x="13" y="9" width="5.5" height="2" rx="0.5" fill="currentColor" opacity="0.6"/>
  <rect x="13" y="13" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
  <rect x="13" y="17" width="2.5" height="2" rx="0.5" fill="currentColor" opacity="0.25"/>
</svg>`,
  "pending-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Hourglass in header -->
  <path d="M9.5,3.5 L12.5,3.5 L11,5.2 L12.5,6.8 L9.5,6.8 L11,5.2 Z" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: spinner circle + data -->
  <circle cx="5" cy="10" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.3"/>
  <circle cx="5" cy="10" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="1" stroke-dasharray="3 6" stroke-linecap="round"/>
  <line x1="8" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: spinner circle + data -->
  <circle cx="5" cy="14.5" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.3"/>
  <circle cx="5" cy="14.5" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.7" stroke-dasharray="5 4" stroke-linecap="round"/>
  <line x1="8" y1="14.5" x2="13" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: spinner circle + data -->
  <circle cx="5" cy="19" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.3"/>
  <circle cx="5" cy="19" r="1.5" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.5" stroke-dasharray="2 7" stroke-linecap="round"/>
  <line x1="8" y1="19" x2="12" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="19" x2="19" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "percentage": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
  "pnl-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: sparkline (uptrend) + P&L value -->
  <polyline points="4,11 5.5,9.5 7,10.5 8.5,8.5 10,9 11.5,8" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="1"/>
  <line x1="14" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="18.5" y1="10" x2="20.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: sparkline (downtrend) + P&L value -->
  <polyline points="4,13 5.5,14 7,13.5 8.5,15 10,14.5 11.5,16" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.7"/>
  <line x1="14" y1="14.5" x2="16.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="18.5" y1="14.5" x2="20.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: sparkline (flat) + P&L value -->
  <polyline points="4,19 5.5,18.5 7,19.2 8.5,18.8 10,19 11.5,18.7" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>
  <line x1="14" y1="19" x2="17.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="18.5" y1="19" x2="20.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "pnl": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Horizontal dividing line -->
  <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- P letter -->
  <text x="7" y="10" font-family="sans-serif" font-weight="600" font-size="8" fill="currentColor" text-anchor="middle">P</text>
  <!-- L letter -->
  <text x="17" y="19" font-family="sans-serif" font-weight="600" font-size="8" fill="currentColor" text-anchor="middle">L</text>
  <!-- Up arrow near P -->
  <polyline points="12,9 14,6 16,9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
  <line x1="14" y1="6" x2="14" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
  <!-- Down arrow near L -->
  <polyline points="4,18 6,21 8,18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <line x1="6" y1="14" x2="6" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
</svg>`,
  "portfolio": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Segment 1 - largest -->
  <path d="M12 3a9 9 0 0 1 7.79 4.5L12 12V3Z" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Segment 2 - medium -->
  <path d="M19.79 7.5A9 9 0 0 1 12 21V12l7.79-4.5Z" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Segment 3 - smallest -->
  <path d="M12 21A9 9 0 0 1 12 3v9l0 9Z" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Hollow center -->
  <circle cx="12" cy="12" r="4" fill="white" stroke="none"/>
  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="0" opacity="0"/>
</svg>`,
  "position-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Center axis for bars -->
  <line x1="12" y1="7.5" x2="12" y2="20.5" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: positive bar (right of center) -->
  <text x="4" y="10.5" font-size="2.8" font-family="sans-serif" fill="currentColor" opacity="0.5">+500</text>
  <rect x="12" y="9" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
  <!-- Row 2: negative bar (left of center) -->
  <text x="4" y="15" font-size="2.8" font-family="sans-serif" fill="currentColor" opacity="0.5">-200</text>
  <rect x="7" y="13.5" width="5" height="2" rx="0.5" fill="currentColor" opacity="0.4"/>
  <!-- Row 3: positive bar (smaller) -->
  <text x="4" y="19.5" font-size="2.8" font-family="sans-serif" fill="currentColor" opacity="0.5">+150</text>
  <rect x="12" y="18" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.3"/>
</svg>`,
  "position": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  "price-alert": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Bell body -->
  <path d="M10 5a2 2 0 1 1 4 0 6 6 0 0 1 4 5.65V14l1.5 2H4.5L6 14v-3.35A6 6 0 0 1 10 5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Bell clapper -->
  <path d="M10.5 18a1.75 1.75 0 0 0 3 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Alert radiating lines -->
  <line x1="20" y1="5" x2="22" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="20.5" y1="8" x2="22.5" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <line x1="20" y1="11" x2="22" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.15"/>
</svg>`,
  "refresh": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  "rejected-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Warning triangle in header -->
  <path d="M10.5,3.8 L12,6.5 L9,6.5 Z" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
  <line x1="10.5" y1="4.8" x2="10.5" y2="5.6" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" opacity="0.9"/>
  <circle cx="10.5" cy="6" r="0.25" fill="currentColor" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: X mark + data -->
  <line x1="4" y1="9" x2="6" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="1"/>
  <line x1="6" y1="9" x2="4" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="1"/>
  <line x1="8" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 2: X mark + data -->
  <line x1="4" y1="13.5" x2="6" y2="15.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
  <line x1="6" y1="13.5" x2="4" y2="15.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
  <line x1="8" y1="14.5" x2="13" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="16" y1="14.5" x2="20" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Row 3: X mark + data -->
  <line x1="4" y1="18" x2="6" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
  <line x1="6" y1="18" x2="4" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
  <line x1="8" y1="19" x2="12.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="16" y1="19" x2="19.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "reports": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Back document (offset) -->
  <rect x="6" y="2" width="14" height="17" rx="1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Front document -->
  <rect x="4" y="5" width="14" height="17" rx="1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Text lines on front document -->
  <line x1="7.5" y1="10" x2="14.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="7.5" y1="13" x2="14.5" y2="13" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="7.5" y1="16" x2="12" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
</svg>`,
  "risk-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Shield-warning in header -->
  <path d="M11,3.3 L11,6.2 Q11,6.8 9.5,6.2" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" fill="none" opacity="0.9"/>
  <path d="M11,3.3 L11,6.2 Q11,6.8 12.5,6.2" stroke="currentColor" stroke-width="0.7" stroke-linecap="round" fill="none" opacity="0.9"/>
  <line x1="11" y1="4" x2="11" y2="5.2" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" opacity="0.9"/>
  <circle cx="11" cy="5.7" r="0.25" fill="currentColor" opacity="0.9"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: label + risk level bar (high) -->
  <line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="9" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="9" width="11" height="2" rx="1" fill="currentColor" opacity="0.7"/>
  <!-- Row 2: label + risk level bar (medium) -->
  <line x1="4" y1="14.5" x2="7" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="13.5" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="13.5" width="7" height="2" rx="1" fill="currentColor" opacity="0.45"/>
  <!-- Row 3: label + risk level bar (low) -->
  <line x1="4" y1="19" x2="6.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <rect x="9" y="18" width="12" height="2" rx="1" stroke="currentColor" stroke-width="0.7" fill="none" opacity="0.3"/>
  <rect x="9" y="18" width="3.5" height="2" rx="1" fill="currentColor" opacity="0.25"/>
</svg>`,
  "risk-gauge": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Semi-circular gauge segments -->
  <!-- Low segment (left) -->
  <path d="M4 16 A8 8 0 0 1 8.34 8.34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Medium segment (center) -->
  <path d="M8.34 8.34 A8 8 0 0 1 15.66 8.34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
  <!-- High segment (right) -->
  <path d="M15.66 8.34 A8 8 0 0 1 20 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
  <!-- Needle pointing to high zone -->
  <line x1="12" y1="16" x2="17.5" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Center pivot circle -->
  <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
</svg>`,
  "risk": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  "scenarios": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Center node -->
  <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/>
  <!-- Connecting lines to outer nodes -->
  <line x1="12" y1="10" x2="12" y2="4.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="13.7" y1="10.6" x2="18" y2="5.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="14" y1="12" x2="19.5" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="13.7" y1="13.4" x2="18" y2="18.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="12" y1="14" x2="12" y2="19.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="10.3" y1="13.4" x2="6" y2="18.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Outer nodes at varying opacities -->
  <circle cx="12" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1" opacity="1"/>
  <circle cx="18.5" cy="5" r="1.5" stroke="currentColor" stroke-width="1" opacity="0.8"/>
  <circle cx="20" cy="12" r="1.5" stroke="currentColor" stroke-width="1" opacity="0.6"/>
  <circle cx="18.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <circle cx="12" cy="20.5" r="1.5" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <circle cx="5.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1" opacity="0.4"/>
</svg>`,
  "settings": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Outer gear/cog shape -->
  <path d="M12 1.5 L13.5 3.5 L16 3 L17 5.2 L19.5 5.5 L19.5 8 L21.5 9.5 L20.5 11.5 L22 13.5 L20.2 15 L21 17.3 L18.8 18 L18.5 20.5 L16 20.2 L14.5 22 L12.5 20.8 L10 22 L8.5 20.2 L6 20.5 L5.5 18 L3 17.3 L3.8 15 L2 13.5 L3.5 11.5 L2.5 9.5 L4.5 8 L4.5 5.5 L7 5.2 L8 3 L10.5 3.5 L12 1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Inner circle -->
  <circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.5"/>
</svg>`,
  "settlement-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16.5" x2="21" y2="16.5" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <!-- Row 1: T+1 text + checkmark -->
  <text x="4" y="10.5" font-size="3.5" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.9">T+1</text>
  <line x1="12" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <polyline points="18,10.5 19,11.5 21,9" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="1"/>
  <!-- Row 2: T+2 text + dot (pending) -->
  <text x="4" y="15" font-size="3.5" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.7">T+2</text>
  <line x1="12" y1="14.5" x2="16.5" y2="14.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <circle cx="19.5" cy="14.5" r="1.2" fill="currentColor" opacity="0.5"/>
  <!-- Row 3: T+0 text + checkmark -->
  <text x="4" y="19.5" font-size="3.5" font-family="sans-serif" font-weight="bold" fill="currentColor" opacity="0.5">T+0</text>
  <line x1="12" y1="19" x2="15.5" y2="19" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <polyline points="18,19.5 19,20.5 21,18" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>
</svg>`,
  "spread": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Shaded area between diverging lines -->
  <path d="M4 12L12 5L20 12L12 19Z" fill="currentColor" opacity="0.08"/>
  <!-- Upper diverging line -->
  <path d="M4 12L12 5L20 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Lower diverging line -->
  <path d="M4 12L12 19L20 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Center dashed vertical line -->
  <line x1="12" y1="3" x2="12" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="12" y1="8" x2="12" y2="11" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="12" y1="13" x2="12" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>`,
  "stock": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 8 11 12 14 17 7 21 10"/><polyline points="17 7 21 7 21 10"/></svg>`,
  "stress-test": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Rounded rectangle container -->
  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Dramatic zigzag line -->
  <polyline points="6,16 9,14 11,15 13.5,8 15,17 17,7 18,13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Alert point at the peak -->
  <circle cx="17" cy="7" r="1.5" fill="currentColor" opacity="0.8"/>
</svg>`,
  "sun": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  "ticker": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="8" rx="1"/><polyline points="5 12 8 10 11 13 14 9 17 11 20 12"/></svg>`,
  "trade-blotter": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Table outline -->
  <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Header row fill -->
  <rect x="2" y="3" width="20" height="4" rx="2" fill="currentColor" opacity="0.15"/>
  <!-- Header bottom line -->
  <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <!-- Column dividers -->
  <line x1="8" y1="7" x2="8" y2="21" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="14" y1="7" x2="14" y2="21" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="19" y1="7" x2="19" y2="21" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <!-- Row 1 data lines -->
  <line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <line x1="9.5" y1="10" x2="12.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="10" x2="17.5" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Row 2 data lines -->
  <line x1="4" y1="14" x2="7" y2="14" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <line x1="9.5" y1="14" x2="13" y2="14" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="14" x2="18" y2="14" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Row 3 data lines -->
  <line x1="4" y1="18" x2="6.5" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  <line x1="9.5" y1="18" x2="12" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <line x1="15.5" y1="18" x2="17" y2="18" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <!-- Row separators -->
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
  <line x1="3" y1="16" x2="21" y2="16" stroke="currentColor" stroke-width="0.5" opacity="0.15"/>
</svg>`,
  "trade-ticket": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><path d="M14 16 L17 13 L20 16" fill="none"/></svg>`,
  "trending-down": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  "trending-up": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  "upload": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  "volatility": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Vertical center line -->
  <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <!-- Low amplitude wave -->
  <path d="M3 12 Q6 10 9 12 Q12 14 15 12 Q18 10 21 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <!-- Medium amplitude wave -->
  <path d="M3 12 Q6 7 9 12 Q12 17 15 12 Q18 7 21 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <!-- High amplitude wave -->
  <path d="M3 12 Q6 4 9 12 Q12 20 15 12 Q18 4 21 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="1"/>
</svg>`,
  "watchlist": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Row 1 -->
  <line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="17,5 18.5,6.5 20.5,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Row 2 -->
  <line x1="4" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <polyline points="17,12 20.5,9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <polyline points="18.5,9.5 20.5,9.5 20.5,11.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <!-- Row 3 -->
  <line x1="4" y1="18" x2="10" y2="18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
  <polyline points="17,15.5 18.5,17 20.5,15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
</svg>`,
  "waterfall": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="3" height="8"/><rect x="7" y="8" width="3" height="6"/><rect x="12" y="6" width="3" height="4"/><rect x="17" y="10" width="3" height="8"/><line x1="1" y1="20" x2="23" y2="20"/></svg>`,
  "wrench": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  "yield-curve": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <!-- Area fill below curve -->
  <path d="M3 20L7 16Q11 10 14 9L21 7V20H3Z" fill="currentColor" opacity="0.1"/>
  <!-- Curve -->
  <path d="M3 20C5 17 8 13 11 11C14 9 18 8 21 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Data points -->
  <circle cx="7" cy="15" r="1.5" fill="currentColor" opacity="0.5"/>
  <circle cx="12" cy="10.5" r="1.5" fill="currentColor" opacity="0.7"/>
  <circle cx="18" cy="7.5" r="1.5" fill="currentColor"/>
</svg>`,

  // ── Curated trading-action + flow icons (fixed-palette) ─────────────
  // These ship with hardcoded hex fills so they keep their stylized
  // colour identity in both themes. svgToDataUrl()'s currentColor
  // replacement is a no-op for them — callers can still pass a color
  // via the dock-item iconColor field but it won't recolor these.
  "algo": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="5" y1="6" x2="12" y2="12" stroke="#a78bfa" stroke-width="1.4"></line><line x1="19" y1="6" x2="12" y2="12" stroke="#a78bfa" stroke-width="1.4"></line><line x1="5" y1="18" x2="12" y2="12" stroke="#a78bfa" stroke-width="1.4"></line><line x1="19" y1="18" x2="12" y2="12" stroke="#a78bfa" stroke-width="1.4"></line><rect x="10" y="10" width="4" height="4" rx="0.6" fill="#a78bfa"></rect><circle cx="5" cy="6" r="2" fill="#22d3ee"></circle><circle cx="19" cy="6" r="2" fill="#1ed8a0"></circle><circle cx="5" cy="18" r="2" fill="#ffb547"></circle><circle cx="19" cy="18" r="2" fill="#ff4d7d"></circle></svg>`,
  "audit": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.6"></line><line x1="3" y1="9" x2="11" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.4"></line><line x1="3" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.4"></line><line x1="3" y1="17" x2="9" y2="17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.4"></line><circle cx="16" cy="15" r="4" stroke="#22d3ee" stroke-width="2" fill="none"></circle><circle cx="16" cy="15" r="1.5" fill="#22d3ee"></circle><line x1="19" y1="18" x2="22" y2="21" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round"></line></svg>`,
  "buy": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 L21 11 L17 11 L17 21 L7 21 L7 11 L3 11 Z" fill="#1ed8a0" stroke="#0ea671" stroke-width="0.8" stroke-linejoin="round"></path><line x1="10" y1="14" x2="14" y2="14" stroke="white" stroke-width="1.4" stroke-linecap="round" opacity="0.85"></line></svg>`,
  "cancel-order": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="#ff4d7d" opacity="0.22" stroke="#ff4d7d" stroke-width="1.4" stroke-linejoin="round"></path><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke="#ff4d7d" stroke-width="2.2" stroke-linecap="round"></line><line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke="#ff4d7d" stroke-width="2.2" stroke-linecap="round"></line></svg>`,
  "commodity": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="2.5" fill="#ffb547"></circle><circle cx="6" cy="6" r="2.2" fill="#22d3ee"></circle><circle cx="18" cy="6" r="2.2" fill="#1ed8a0"></circle><circle cx="6" cy="18" r="2.2" fill="#a78bfa"></circle><circle cx="18" cy="18" r="2.2" fill="#ff4d7d"></circle><line x1="7.5" y1="7.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1" opacity="0.5"></line><line x1="16.5" y1="7.5" x2="13.5" y2="10.5" stroke="currentColor" stroke-width="1" opacity="0.5"></line><line x1="7.5" y1="16.5" x2="10.5" y2="13.5" stroke="currentColor" stroke-width="1" opacity="0.5"></line><line x1="16.5" y1="16.5" x2="13.5" y2="13.5" stroke="currentColor" stroke-width="1" opacity="0.5"></line></svg>`,
  "connectivity": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="5" y1="5" x2="19" y2="5" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><line x1="5" y1="5" x2="12" y2="12" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><line x1="19" y1="5" x2="12" y2="12" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><line x1="5" y1="19" x2="12" y2="12" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><line x1="19" y1="19" x2="12" y2="12" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><line x1="5" y1="19" x2="19" y2="19" stroke="#22d3ee" stroke-width="1" opacity="0.5"></line><circle cx="5" cy="5" r="2" fill="#5b8cff"></circle><circle cx="19" cy="5" r="2" fill="#1ed8a0"></circle><circle cx="5" cy="19" r="2" fill="#a78bfa"></circle><circle cx="19" cy="19" r="2" fill="#ffb547"></circle><circle cx="12" cy="12" r="2.4" fill="#22d3ee"></circle></svg>`,
  "crypto": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L19 12 L12 22 L5 12 Z" fill="#ffb547" stroke="#d18820" stroke-width="0.8" stroke-linejoin="round"></path><path d="M12 2 L12 22 L19 12 Z" fill="#d18820" opacity="0.45"></path><path d="M7 11 L17 11" stroke="white" stroke-width="1" opacity="0.85"></path><path d="M9 14 L15 14" stroke="white" stroke-width="1" opacity="0.85"></path></svg>`,
  "depth-chart": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="12" y1="3" x2="12" y2="21" stroke="#22d3ee" stroke-width="1" stroke-dasharray="1 1.2"></line><path d="M3 21 L3 18 L5 16 L7 13 L11 9 L11 21 Z" fill="#1ed8a0" opacity="0.9"></path><path d="M21 21 L21 18 L19 16 L17 14 L13 9 L13 21 Z" fill="#ff4d7d" opacity="0.9"></path><line x1="3" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="1" opacity="0.4"></line></svg>`,
  "equity": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L20.5 7 L20.5 17 L12 22 L3.5 17 L3.5 7 Z" fill="#5b8cff" stroke="#3a64d4" stroke-width="0.8" stroke-linejoin="round"></path><text x="12" y="16" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="11" font-weight="800" fill="white">$</text></svg>`,
  "execute": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 5 L21 12 L3 19 L7 12 Z" fill="#5b8cff" stroke="#3a64d4" stroke-width="0.8" stroke-linejoin="round"></path><path d="M7 12 L17 12" stroke="white" stroke-width="1.4" stroke-linecap="round" opacity="0.6"></path><circle cx="20" cy="12" r="1.2" fill="#22d3ee"></circle></svg>`,
  "export": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 13 L3 21 L21 21 L21 13" stroke="#5b8cff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M12 17 L12 4" stroke="#1ed8a0" stroke-width="2.2" stroke-linecap="round"></path><path d="M7 8 L12 3 L17 8" stroke="#1ed8a0" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
  "exposure": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#5b8cff" stroke-width="3" stroke-dasharray="14 1 9 1 16 1 12 1"></circle><circle cx="12" cy="12" r="8.5" fill="none" stroke="#1ed8a0" stroke-width="3" stroke-dasharray="9 45" stroke-dashoffset="-14"></circle><circle cx="12" cy="12" r="8.5" fill="none" stroke="#ffb547" stroke-width="3" stroke-dasharray="16 38" stroke-dashoffset="-24"></circle><circle cx="12" cy="12" r="8.5" fill="none" stroke="#ff4d7d" stroke-width="3" stroke-dasharray="12 42" stroke-dashoffset="-41"></circle><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.12"></circle><circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.6"></circle></svg>`,
  "fill-report": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3 L19 3 L19 19 L17 21 L15 19 L13 21 L11 19 L9 21 L7 19 L5 21 Z" fill="#5b8cff" opacity="0.18" stroke="#5b8cff" stroke-width="1.3" stroke-linejoin="round"></path><line x1="8" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"></line><line x1="8" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.5"></line><path d="M8 14.5 L10.5 17 L16.5 11" stroke="#1ed8a0" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
  "filter": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="6.5" x2="21" y2="6.5" stroke="currentColor" stroke-width="1.4" opacity="0.4" stroke-linecap="round"></line><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.4" opacity="0.4" stroke-linecap="round"></line><line x1="3" y1="17.5" x2="21" y2="17.5" stroke="currentColor" stroke-width="1.4" opacity="0.4" stroke-linecap="round"></line><circle cx="8" cy="6.5" r="2.4" fill="#a78bfa" stroke="currentColor" stroke-width="0.6"></circle><circle cx="16" cy="12" r="2.4" fill="#22d3ee" stroke="currentColor" stroke-width="0.6"></circle><circle cx="11" cy="17.5" r="2.4" fill="#1ed8a0" stroke="currentColor" stroke-width="0.6"></circle></svg>`,
  "futures": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6 L11 12 L3 18 Z" fill="#22d3ee" opacity="0.9"></path><path d="M11 6 L19 12 L11 18 Z" fill="#5b8cff"></path><line x1="20" y1="5" x2="20" y2="19" stroke="#a78bfa" stroke-width="2" stroke-linecap="round"></line></svg>`,
  "fx": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 9 L7 4 L11 4 L11 12 L7 16 L2.5 16 Z" fill="#1ed8a0" opacity="0.95"></path><path d="M21.5 15 L17 20 L13 20 L13 12 L17 8 L21.5 8 Z" fill="#5b8cff" opacity="0.95"></path><line x1="16" y1="6" x2="8" y2="18" stroke="#ffb547" stroke-width="1.6" stroke-linecap="round"></line></svg>`,
  "greeks": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4 L20 19 L4 19 Z" fill="#a78bfa" opacity="0.22" stroke="#a78bfa" stroke-width="1.4" stroke-linejoin="round"></path><path d="M12 9 L17 18 L7 18 Z" fill="#a78bfa" opacity="0.5"></path><circle cx="8" cy="17" r="0.9" fill="#22d3ee"></circle><circle cx="16" cy="17" r="0.9" fill="#ffb547"></circle><circle cx="12" cy="6.5" r="0.9" fill="#1ed8a0"></circle></svg>`,
  "indicator": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12 L5 12 L6 8 L8 16 L10 6 L12 18 L14 10 L16 12 L22 12" stroke="#22d3ee" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="18" r="2.8" fill="#ffb547" opacity="0.3"></circle><circle cx="12" cy="18" r="1.4" fill="#ffb547"></circle></svg>`,
  "liquidity": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="2.5" fill="#22d3ee"></circle><circle cx="12" cy="12" r="5.5" stroke="#22d3ee" stroke-width="1.4" fill="none" opacity="0.75"></circle><circle cx="12" cy="12" r="8.5" stroke="#22d3ee" stroke-width="1.2" fill="none" opacity="0.45"></circle><circle cx="12" cy="12" r="11" stroke="#22d3ee" stroke-width="1" fill="none" opacity="0.2"></circle></svg>`,
  "loss": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L20.5 7 L20.5 17 L12 22 L3.5 17 L3.5 7 Z" fill="#ff4d7d" opacity="0.22" stroke="#ff4d7d" stroke-width="1.4" stroke-linejoin="round"></path><path d="M8 10 L12 15 L16 10" stroke="#ff4d7d" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="12" y1="14" x2="12" y2="8" stroke="#ff4d7d" stroke-width="2" stroke-linecap="round"></line></svg>`,
  "new-order": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="#22d3ee" opacity="0.22" stroke="#22d3ee" stroke-width="1.4" stroke-linejoin="round"></path><line x1="12" y1="7" x2="12" y2="17" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round"></line><line x1="7" y1="12" x2="17" y2="12" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round"></line></svg>`,
  "news": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="14" height="3.5" rx="0.5" fill="#5b8cff"></rect><rect x="3" y="9" width="18" height="2.4" rx="0.5" fill="currentColor" opacity="0.4"></rect><rect x="3" y="12.5" width="15" height="2.4" rx="0.5" fill="currentColor" opacity="0.3"></rect><rect x="3" y="16" width="11" height="2.4" rx="0.5" fill="currentColor" opacity="0.3"></rect><circle cx="20" cy="5.5" r="2.5" fill="#ff4d7d"></circle></svg>`,
  "options": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4" stroke-linejoin="round"></path><path d="M12 2.5 L21.5 12 L12 12 Z" fill="#1ed8a0"></path><path d="M12 21.5 L2.5 12 L12 12 Z" fill="#ff4d7d"></path><text x="16" y="10.5" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="6" font-weight="800" fill="white">C</text><text x="8" y="18.5" text-anchor="middle" font-family="'Inter', system-ui, sans-serif" font-size="6" font-weight="800" fill="white">P</text></svg>`,
  "positions": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 L21 7 L12 11 L3 7 Z" fill="#22d3ee" stroke="#0aa6b8" stroke-width="0.8" stroke-linejoin="round"></path><path d="M3 11 L12 15 L21 11 L21 7 L12 11 L3 7 Z" fill="#5b8cff" stroke="#3a64d4" stroke-width="0.8" stroke-linejoin="round"></path><path d="M3 15 L12 19 L21 15 L21 11 L12 15 L3 11 Z" fill="#a78bfa" stroke="#7c5fe6" stroke-width="0.8" stroke-linejoin="round"></path></svg>`,
  "profit": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L20.5 7 L20.5 17 L12 22 L3.5 17 L3.5 7 Z" fill="#1ed8a0" opacity="0.22" stroke="#1ed8a0" stroke-width="1.4" stroke-linejoin="round"></path><path d="M8 14 L12 9 L16 14" stroke="#1ed8a0" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><line x1="12" y1="10" x2="12" y2="16" stroke="#1ed8a0" stroke-width="2" stroke-linecap="round"></line></svg>`,
  "search": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="6.5" stroke="#22d3ee" stroke-width="2" fill="none"></circle><circle cx="10" cy="10" r="3" fill="#22d3ee" opacity="0.3"></circle><line x1="14.8" y1="14.8" x2="20.5" y2="20.5" stroke="#22d3ee" stroke-width="2.4" stroke-linecap="round"></line><circle cx="10" cy="10" r="1" fill="#22d3ee"></circle></svg>`,
  "sell": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 L3 13 L7 13 L7 3 L17 3 L17 13 L21 13 Z" fill="#ff4d7d" stroke="#d12856" stroke-width="0.8" stroke-linejoin="round"></path><line x1="10" y1="10" x2="14" y2="10" stroke="white" stroke-width="1.4" stroke-linecap="round" opacity="0.85"></line></svg>`,
  "settlement": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 9 L11 9 L13 12 L11 15 L3 15 Z" fill="#1ed8a0"></path><path d="M21 15 L13 15 L11 12 L13 9 L21 9 Z" fill="#5b8cff"></path><circle cx="12" cy="12" r="1.6" fill="white" stroke="#22d3ee" stroke-width="1.2"></circle></svg>`,
  "stop-loss": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3 L16 3 L21 8 L21 16 L16 21 L8 21 L3 16 L3 8 Z" fill="#ff4d7d" stroke="#d12856" stroke-width="0.8" stroke-linejoin="round"></path><line x1="8" y1="12" x2="16" y2="12" stroke="white" stroke-width="2.2" stroke-linecap="round"></line></svg>`,
  "take-profit": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#ffb547" stroke-width="1.4" fill="none"></circle><circle cx="12" cy="12" r="5.5" stroke="#ffb547" stroke-width="1.2" fill="none" opacity="0.7"></circle><circle cx="12" cy="12" r="2.4" fill="#ffb547"></circle><line x1="12" y1="2" x2="12" y2="5" stroke="#ffb547" stroke-width="1.4" stroke-linecap="round"></line><line x1="12" y1="19" x2="12" y2="22" stroke="#ffb547" stroke-width="1.4" stroke-linecap="round"></line><line x1="2" y1="12" x2="5" y2="12" stroke="#ffb547" stroke-width="1.4" stroke-linecap="round"></line><line x1="19" y1="12" x2="22" y2="12" stroke="#ffb547" stroke-width="1.4" stroke-linecap="round"></line></svg>`,
  "trades": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4 L4 12 L9 20" stroke="#1ed8a0" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><path d="M15 4 L20 12 L15 20" stroke="#ff4d7d" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="9" r="1.4" fill="#22d3ee"></circle><circle cx="12" cy="12" r="1.4" fill="#ffb547"></circle><circle cx="12" cy="15" r="1.4" fill="#a78bfa"></circle></svg>`,
  "var": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 20 L6 20 Q 8 20, 9 14 Q 10.5 5, 12 5 Q 13.5 5, 15 14 Q 16 20, 18 20 L22 20" stroke="#22d3ee" stroke-width="1.5" fill="none" stroke-linecap="round"></path><path d="M2 20 L6 20 Q 7 20, 7.5 17.5 L 7.5 20 Z" fill="#ff4d7d"></path><path d="M22 20 L18 20 Q 17 20, 16.5 17.5 L 16.5 20 Z" fill="#ff4d7d" opacity="0.6"></path><text x="12" y="13" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="6" font-weight="700" fill="#22d3ee">σ</text></svg>`,
  "volume": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="13" width="2.5" height="8" fill="#22d3ee"></rect><rect x="6.5" y="9" width="2.5" height="12" fill="#5b8cff"></rect><rect x="10" y="5" width="2.5" height="16" fill="#a78bfa"></rect><rect x="13.5" y="11" width="2.5" height="10" fill="#1ed8a0"></rect><rect x="17" y="7" width="2.5" height="14" fill="#ffb547"></rect><circle cx="4.25" cy="11" r="0.8" fill="#22d3ee"></circle><circle cx="11.25" cy="3" r="0.8" fill="#a78bfa"></circle><circle cx="18.25" cy="5" r="0.8" fill="#ffb547"></circle></svg>`,
};

/**
 * Convert any SVG string to a data URL with a specific color.
 * Replaces "currentColor" with the provided hex color.
 * Strips HTML comments and normalizes whitespace for clean base64 encoding.
 *
 * This is the SINGLE implementation — all icon-to-data-URL conversion
 * should go through this function.
 */
export function svgToDataUrl(svg: string, color: string = '#ffffff'): string {
  if (!svg) return '';
  const clean = svg
    .replace(/currentColor/g, color)
    .replace(/<!--[\s\S]*?-->/g, '')   // strip HTML comments
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim();
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clean)))}`;

}

/**
 * Convert a custom market icon (by key name) to a data URL with a specific color.
 * Looks up the SVG string from MARKET_ICON_SVGS and delegates to svgToDataUrl.
 */
export function marketIconToDataUrl(iconKey: string, color: string = '#ffffff'): string {
  const svg = MARKET_ICON_SVGS[iconKey];
  if (!svg) return '';
  return svgToDataUrl(svg, color);
}

// ─── Dock system button convenience exports ────────────────────────
// Named re-exports for the 9 system icons used by dock.ts.
// Keeps dock.ts imports clean without needing a separate module.

/** Wrench icon — used for the Tools dropdown button. */
export const TOOLS_SVG = MARKET_ICON_SVGS["wrench"];
/** Gear icon — used for the Dock Editor menu item. */
export const SETTINGS_SVG = MARKET_ICON_SVGS["settings"];
/** Refresh icon — used for "Reload Dock" menu item. */
export const REFRESH_SVG = MARKET_ICON_SVGS["refresh"];
/** Code/terminal icon — used for "Developer Tools" menu item. */
export const CODE_SVG = MARKET_ICON_SVGS["code"];
/** Download icon — used for "Export Config" menu item. */
export const DOWNLOAD_SVG = MARKET_ICON_SVGS["download"];
/** Upload icon — used for "Import Config" menu item. */
export const UPLOAD_SVG = MARKET_ICON_SVGS["upload"];
/** Sun icon — default theme toggle icon for dark mode. */
export const SUN_SVG = MARKET_ICON_SVGS["sun"];
/** Moon icon — default theme toggle icon for light mode. */
export const MOON_SVG = MARKET_ICON_SVGS["moon"];
/** Eye icon — used for "Show/Hide Provider" menu item. */
export const EYE_SVG = MARKET_ICON_SVGS["eye"];
