export interface PaletteSwatch {
  varName: string;
  label: string;
  role: string;
}
export interface PaletteGroup {
  id: string;
  label: string;
  swatches: PaletteSwatch[];
}

/** Token groups for the Palette section. Every varName is emitted by
 *  `@wellsfargo-starui/design-system/css` (verified against dist/css/theme.css), so each
 *  swatch renders the live, theme-reactive value. */
export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    id: 'surface',
    label: 'Surface',
    swatches: [
      { varName: '--ds-surface-ground', label: 'Ground', role: 'App background' },
      { varName: '--ds-surface-sunken', label: 'Sunken', role: 'Recessed wells' },
      { varName: '--ds-surface-primary', label: 'Primary', role: 'Cards / panels' },
      { varName: '--ds-surface-secondary', label: 'Secondary', role: 'Hover / inset' },
      { varName: '--ds-surface-tertiary', label: 'Tertiary', role: 'Active / selected' },
      { varName: '--ds-surface-quaternary', label: 'Quaternary', role: 'Deep chrome' },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    swatches: [
      { varName: '--ds-text-primary', label: 'Primary', role: 'Body / values' },
      { varName: '--ds-text-secondary', label: 'Secondary', role: 'Labels / captions' },
      { varName: '--ds-text-muted', label: 'Muted', role: 'De-emphasised' },
      { varName: '--ds-text-faint', label: 'Faint', role: 'Placeholders' },
      { varName: '--ds-text-disabled', label: 'Disabled', role: 'Disabled text' },
    ],
  },
  {
    id: 'border',
    label: 'Border',
    swatches: [
      { varName: '--ds-border-primary', label: 'Primary', role: 'Default dividers' },
      { varName: '--ds-border-secondary', label: 'Secondary', role: 'Subtle' },
      { varName: '--ds-border-tertiary', label: 'Tertiary', role: 'Faintest' },
    ],
  },
  {
    id: 'accent',
    label: 'Accent',
    swatches: [
      { varName: '--ds-accent-positive', label: 'Positive', role: 'Gains / buy' },
      { varName: '--ds-accent-negative', label: 'Negative', role: 'Losses / sell' },
      { varName: '--ds-accent-warning', label: 'Warning', role: 'Caution' },
      { varName: '--ds-accent-info', label: 'Info', role: 'Informational' },
      { varName: '--ds-accent-highlight', label: 'Highlight', role: 'Emphasis' },
      { varName: '--ds-accent-purple', label: 'Purple', role: 'Categorical' },
    ],
  },
  {
    id: 'action',
    label: 'Action (Buy / Sell)',
    swatches: [
      { varName: '--ds-action-buy-bg', label: 'Buy BG', role: 'Buy button fill' },
      { varName: '--ds-action-buy-fg', label: 'Buy FG', role: 'Buy button text' },
      { varName: '--ds-action-sell-bg', label: 'Sell BG', role: 'Sell button fill' },
      { varName: '--ds-action-sell-fg', label: 'Sell FG', role: 'Sell button text' },
    ],
  },
  {
    id: 'trade',
    label: 'Trade',
    swatches: [
      { varName: '--ds-trade-bid-fill', label: 'Bid Fill', role: 'Depth bid bar' },
      { varName: '--ds-trade-ask-fill', label: 'Ask Fill', role: 'Depth ask bar' },
      { varName: '--ds-trade-flat', label: 'Flat', role: 'Unchanged' },
      { varName: '--ds-trade-positive-strip', label: 'Pos Strip', role: 'Up tick strip' },
      { varName: '--ds-trade-negative-strip', label: 'Neg Strip', role: 'Down tick strip' },
    ],
  },
  {
    id: 'overlay',
    label: 'Overlay (Soft)',
    swatches: [
      { varName: '--ds-overlay-positive-soft', label: 'Positive', role: 'Soft success bg' },
      { varName: '--ds-overlay-negative-soft', label: 'Negative', role: 'Soft danger bg' },
      { varName: '--ds-overlay-warning-soft', label: 'Warning', role: 'Soft warning bg' },
      { varName: '--ds-overlay-info-soft', label: 'Info', role: 'Soft info bg' },
      { varName: '--ds-overlay-neutral-soft', label: 'Neutral', role: 'Soft neutral bg' },
    ],
  },
  {
    id: 'chart',
    label: 'Chart Ramp',
    swatches: [
      { varName: '--ds-chart-1', label: 'Chart 1', role: 'Series 1' },
      { varName: '--ds-chart-2', label: 'Chart 2', role: 'Series 2' },
      { varName: '--ds-chart-3', label: 'Chart 3', role: 'Series 3' },
      { varName: '--ds-chart-4', label: 'Chart 4', role: 'Series 4' },
      { varName: '--ds-chart-5', label: 'Chart 5', role: 'Series 5' },
    ],
  },
];
