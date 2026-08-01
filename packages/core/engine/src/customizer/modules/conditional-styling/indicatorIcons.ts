/**
 * Curated set of inline-SVG path markup for the small top-right "rule
 * matched" badge that sits on top of every cell (and optionally header)
 * a rule currently applies to.
 *
 * The SVGs are drawn from lucide's `v0.544` catalog — each entry is the
 * INNER markup of a 24×24 lucide icon (no `<svg>` wrapper, no fill,
 * `stroke-linecap="round" stroke-linejoin="round"`). The CSS injector
 * wraps each body into:
 *
 *   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
 *        fill="none" stroke="${color}" stroke-width="2.25"
 *        stroke-linecap="round" stroke-linejoin="round">
 *     {body}
 *   </svg>
 *
 * and base64s the result into a `data:` URL, so the icon rides inside a
 * single CSS `background-image` declaration — no React, no DOM work per
 * matching cell, no conflict with AG-Grid's cell renderer recycling.
 *
 * The selection is deliberately small (~24 icons) and organised by
 * semantic category so the rule editor's dropdown stays scannable.
 */

export interface IndicatorIconDef {
  /** Stable key used in persisted `ConditionalRule.indicator.icon`. */
  key: string;
  /** Short label shown in the picker. */
  label: string;
  /** Sub-grouping for the picker. */
  group:
    | 'direction'
    | 'alert'
    | 'status'
    | 'lifecycle'
    | 'favorite'
    | 'classification';
  /** Inner SVG body (24×24 viewBox, stroke-only, no fill). */
  body: string;
}

const ICONS: ReadonlyArray<IndicatorIconDef> = [
  // ── Direction / movement ──────────────────────────────────────────
  {
    key: 'arrow-up',
    label: 'Arrow up',
    group: 'direction',
    body: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  },
  {
    key: 'arrow-down',
    label: 'Arrow down',
    group: 'direction',
    body: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  },
  {
    key: 'trending-up',
    label: 'Trending up',
    group: 'direction',
    body: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  },
  {
    key: 'trending-down',
    label: 'Trending down',
    group: 'direction',
    body: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  },
  {
    key: 'chevrons-up',
    label: 'Chevrons up',
    group: 'direction',
    body: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  },
  {
    key: 'chevrons-down',
    label: 'Chevrons down',
    group: 'direction',
    body: '<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>',
  },
  {
    key: 'triangle-up-solid',
    label: 'Triangle up',
    group: 'direction',
    body: '<polygon points="12 4 4 20 20 20" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'triangle-down-solid',
    label: 'Triangle down',
    group: 'direction',
    body: '<polygon points="4 4 20 4 12 20" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'corner-triangle-top-right-solid',
    label: 'Corner TR solid',
    group: 'direction',
    body: '<polygon points="22 2 22 14 10 2" fill="currentColor"/>',
  },
  {
    key: 'corner-triangle-top-left-solid',
    label: 'Corner TL solid',
    group: 'direction',
    body: '<polygon points="2 2 14 2 2 14" fill="currentColor"/>',
  },
  {
    key: 'corner-triangle-bottom-right-solid',
    label: 'Corner BR solid',
    group: 'direction',
    body: '<polygon points="22 22 10 22 22 10" fill="currentColor"/>',
  },
  {
    key: 'corner-triangle-bottom-left-solid',
    label: 'Corner BL solid',
    group: 'direction',
    body: '<polygon points="2 22 2 10 14 22" fill="currentColor"/>',
  },
  // ── Alerts / warnings ────────────────────────────────────────────
  {
    key: 'alert-triangle',
    label: 'Warning',
    group: 'alert',
    body:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
  {
    key: 'alert-circle',
    label: 'Alert',
    group: 'alert',
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  },
  {
    key: 'alert-octagon',
    label: 'Stop',
    group: 'alert',
    body:
      '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  },
  {
    key: 'zap',
    label: 'Zap',
    group: 'alert',
    body: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  },
  {
    key: 'zap-solid',
    label: 'Zap solid',
    group: 'alert',
    body: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'flame',
    label: 'Hot',
    group: 'alert',
    body:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  },
  {
    key: 'flame-solid',
    label: 'Hot solid',
    group: 'alert',
    body:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'bell',
    label: 'Alert bell',
    group: 'alert',
    body:
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  },
  {
    key: 'bell-solid',
    label: 'Alert bell solid',
    group: 'alert',
    body:
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9Z" fill="currentColor" stroke="none"/><circle cx="12" cy="21" r="1.7" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'alert-triangle-solid',
    label: 'Warning solid',
    group: 'alert',
    body:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" fill="currentColor"/>',
  },
  {
    key: 'alert-circle-solid',
    label: 'Alert solid',
    group: 'alert',
    body:
      '<circle cx="12" cy="12" r="10" fill="currentColor"/>',
  },
  {
    key: 'alert-octagon-solid',
    label: 'Stop solid',
    group: 'alert',
    body:
      '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" fill="currentColor"/>',
  },
  // ── Status dots / flags ──────────────────────────────────────────
  {
    key: 'circle-dot',
    label: 'Dot',
    group: 'status',
    body: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  },
  {
    key: 'circle-dot-solid',
    label: 'Dot solid',
    group: 'status',
    body: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'flag',
    label: 'Flag',
    group: 'status',
    body: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  },
  {
    key: 'flag-solid',
    label: 'Flag solid',
    group: 'status',
    body:
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12z" fill="currentColor" stroke="none"/><rect x="3.25" y="15" width="1.5" height="7" rx="0.5" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'pin',
    label: 'Pin',
    group: 'status',
    body:
      '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  },
  {
    key: 'pin-solid',
    label: 'Pin solid',
    group: 'status',
    body:
      '<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" fill="currentColor" stroke="none"/><rect x="11.25" y="17" width="1.5" height="5" rx="0.5" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'bookmark',
    label: 'Bookmark',
    group: 'status',
    body: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  },
  {
    key: 'bookmark-solid',
    label: 'Bookmark solid',
    group: 'status',
    body: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" stroke="none"/>',
  },
  // ── Lifecycle ────────────────────────────────────────────────────
  {
    key: 'check-circle',
    label: 'Confirmed',
    group: 'lifecycle',
    body: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  },
  {
    key: 'x-circle',
    label: 'Rejected',
    group: 'lifecycle',
    body:
      '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  },
  {
    key: 'clock',
    label: 'Pending',
    group: 'lifecycle',
    body: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
  {
    key: 'lock',
    label: 'Locked',
    group: 'lifecycle',
    body:
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  },
  // ── Favorite / curation ──────────────────────────────────────────
  {
    key: 'star',
    label: 'Star',
    group: 'favorite',
    body: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  },
  {
    key: 'star-solid',
    label: 'Star solid',
    group: 'favorite',
    body:
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'eye',
    label: 'Watch',
    group: 'favorite',
    body: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    key: 'eye-solid',
    label: 'Watch solid',
    group: 'favorite',
    body:
      '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'target',
    label: 'Target',
    group: 'favorite',
    body: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  },
  {
    key: 'target-solid',
    label: 'Target solid',
    group: 'favorite',
    body:
      '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'sparkles',
    label: 'Sparkle',
    group: 'favorite',
    body:
      '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>',
  },
  {
    key: 'sparkles-solid',
    label: 'Sparkle solid',
    group: 'favorite',
    body:
      '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" fill="currentColor" stroke="none"/>',
  },
  // ── Classification ───────────────────────────────────────────────
  {
    key: 'tag',
    label: 'Tag',
    group: 'classification',
    body:
      '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  },
  {
    key: 'info',
    label: 'Info',
    group: 'classification',
    body:
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  },
];

export const INDICATOR_ICONS: ReadonlyArray<IndicatorIconDef> = ICONS;

const byKey = new Map<string, IndicatorIconDef>(ICONS.map((i) => [i.key, i]));

/** Look up an icon def by its stored key. Returns `undefined` for
 *  unknown keys — persisted snapshots may reference an icon that was
 *  since renamed or removed. */
export function findIndicatorIcon(key: string | undefined): IndicatorIconDef | undefined {
  if (!key) return undefined;
  return byKey.get(key);
}

/**
 * Encode an icon + stroke colour as a `data:` URL usable in CSS
 * `background-image`. The colour is embedded directly in the SVG's
 * `stroke` attribute (and `fill` for solid-fill shapes that use
 * `fill="currentColor"`) so the ::before pseudo-element doesn't need
 * to inherit `color` — which would collide with text-colour rules.
 */
export function iconAsDataUrl(icon: IndicatorIconDef, color: string): string {
  const stroke = color || 'currentColor';
  // Replace `currentColor` in the body with the explicit stroke so the
  // background-image renders correctly even when the cell doesn't
  // propagate the `color` property (e.g. cells with no text).
  const body = icon.body.replaceAll('currentColor', stroke);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${stroke}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">` +
    body +
    `</svg>`;
  // Percent-encode the minimal set that CSS url() cares about. Avoids
  // a base64 round-trip — smaller payload, readable DevTools.
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\s+/g, ' ');
  return `data:image/svg+xml;utf8,${encoded}`;
}
