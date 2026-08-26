/**
 * Opening suggestions for the empty state.
 *
 * Discovery was otherwise a paragraph describing capabilities the user then had
 * to phrase themselves. These are the asks people actually make, written the
 * way they'd say them, so one click shows what the assistant can do.
 */
export interface Starter {
  label: string;
  /** Sent verbatim — phrased as a user would, not as a command. */
  prompt: string;
}

/** Shown when a specific blotter is in play (the wand-launched panel). */
export const SCOPED_STARTERS: readonly Starter[] = [
  { label: 'Summarize this data', prompt: 'Summarize what\'s in this blotter — give me the highlights.' },
  { label: 'Top 10 positions', prompt: 'Show me the ten largest positions by market value.' },
  { label: 'Break it down by sector', prompt: 'Total the market value by sector and show me how it splits.' },
  { label: 'Why does this look wrong?', prompt: "Something looks off with this blotter — can you check what's wrong?" },
  { label: 'Tick arrows on price moves', prompt: 'Show a green up arrow or red down arrow for 700ms whenever a price column ticks.' },
  { label: 'Right-align the numbers', prompt: 'Right-align all the numeric columns, headers included.' },
  { label: 'Save this as a profile', prompt: 'Save the current setup as a profile called "My view".' },
];

/** Shown in the general assistant, where no grid is assumed. */
export const GENERAL_STARTERS: readonly Starter[] = [
  { label: 'Create a blotter', prompt: 'Create a new blotter with mock positions data and open it.' },
  { label: 'What can you change?', prompt: 'What parts of a blotter can you configure for me?' },
  { label: 'Why is my grid empty?', prompt: 'One of my blotters is showing no data — can you work out why?' },
  { label: 'Highlight losers', prompt: 'Highlight rows where the P&L is negative, in red, on my blotter.' },
];

export function startersFor(scoped: boolean): readonly Starter[] {
  return scoped ? SCOPED_STARTERS : GENERAL_STARTERS;
}
