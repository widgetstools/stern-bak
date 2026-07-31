/**
 * Categorised Excel format examples powering the FormatterPicker's Info
 * popover. Each row shows a label, the monospace format string, and a
 * computed sample output; clicking copies the format into the picker's
 * custom input.
 *
 * The sample outputs here are static strings — the popover does NOT
 * evaluate them at runtime (no performance penalty for opening the
 * help sheet). Computed previews in the picker's main preview chip
 * use the actual formatter, so mismatches would be caught there.
 */

export interface ExcelExample {
  label: string;
  format: string;
  sample: string;
}

export interface ExcelExampleCategory {
  title: string;
  examples: ReadonlyArray<ExcelExample>;
}

export const EXCEL_EXAMPLES: ReadonlyArray<ExcelExampleCategory> = [
  {
    title: 'Numbers & decimals',
    examples: [
      { label: 'Integer w/ thousands', format: '#,##0', sample: '1,235' },
      { label: '2 decimals', format: '#,##0.00', sample: '1,234.57' },
      { label: '4 decimals', format: '#,##0.0000', sample: '1,234.5678' },
      { label: 'No thousands', format: '0.00', sample: '1234.57' },
    ],
  },
  {
    title: 'Currency',
    examples: [
      { label: 'USD', format: '$#,##0.00', sample: '$1,234.57' },
      { label: 'USD parens neg', format: '$#,##0.00;($#,##0.00)', sample: '($1,234.57)' },
      { label: 'USD red negative', format: '$#,##0.00;[Red]-$#,##0.00', sample: '-$1,234.57 (red)' },
      { label: 'EUR', format: '€#,##0.00', sample: '€1,234.57' },
    ],
  },
  {
    title: 'Percent & basis points',
    examples: [
      { label: 'Percent', format: '0.00%', sample: '12.34%' },
      { label: 'Percent (0dp)', format: '0%', sample: '12%' },
      { label: 'Basis points', format: '0.00 "bps"', sample: '12.34 bps' },
    ],
  },
  {
    title: 'Negatives in parens / red',
    examples: [
      { label: 'Parens negative', format: '#,##0.00;(#,##0.00)', sample: '(1,234.57)' },
      { label: 'Red parens', format: '#,##0.00;[Red](#,##0.00)', sample: '[Red](1,234.57)' },
      { label: 'Red only', format: '#,##0.00;[Red]#,##0.00', sample: '[Red]1,234.57' },
      {
        // Bloomberg-style P&L cue: positives green, negatives red, no
        // minus sign on the negative (the format section literal
        // controls rendering; no leading `-` means no minus).
        label: 'Green / Red (no sign)',
        format: '[Green]#,##0.00;[Red]#,##0.00',
        sample: '[Green]1,234.57 · [Red]1,234.57',
      },
      {
        label: 'Green / Red $ (no sign)',
        format: '[Green]$#,##0.00;[Red]$#,##0.00',
        sample: '[Green]$1,234.57 · [Red]$1,234.57',
      },
    ],
  },
  {
    title: 'Dates & times',
    examples: [
      { label: 'ISO date', format: 'yyyy-mm-dd', sample: '2026-04-17' },
      { label: 'US date', format: 'mm/dd/yyyy', sample: '04/17/2026' },
      { label: 'Euro short', format: 'dd-mmm-yy', sample: '17-Apr-26' },
      { label: 'ISO with time', format: 'yyyy-mm-dd hh:mm:ss', sample: '2026-04-17 09:30:00' },
      { label: 'US with AM/PM', format: 'mm/dd/yy h:mm AM/PM', sample: '04/17/26 9:30 AM' },
    ],
  },
  {
    title: 'Conditional (directional)',
    examples: [
      {
        label: 'Green up / red down',
        format: '[>0][Green]▲0.00;[<0][Red]▼0.00;0.00',
        sample: '▲ green, ▼ red, neutral',
      },
      {
        label: 'Thresholds',
        format: '[>100][Red]0;[<=100][Green]0;0',
        sample: 'red >100, green ≤100',
      },
    ],
  },
  {
    title: 'Fixed-income tick (via preset dropdown)',
    examples: [
      { label: '32nds', format: '— use "32nds" preset —', sample: '101-16' },
      { label: '32nds + halves', format: '— use "32nds +" preset —', sample: '101-16+' },
      { label: '64ths', format: '— use "64ths" preset —', sample: '101-161' },
      { label: '128ths', format: '— use "128ths" preset —', sample: '101-162' },
    ],
  },
  {
    title: 'Scientific & custom text',
    examples: [
      { label: 'Scientific', format: '0.00E+00', sample: '1.23E+03' },
      { label: 'Suffix text', format: '@" units"', sample: 'value units' },
      { label: 'Prefix text', format: '"PX " @', sample: 'PX value' },
    ],
  },
];
