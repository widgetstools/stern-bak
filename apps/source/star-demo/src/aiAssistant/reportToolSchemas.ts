/**
 * Schemas for the two tools that put an analysis on a surface with room.
 *
 * Split out of `toolSchemas.ts` for the same reason `columnToolSchemas.ts`
 * was — the repo caps files at 800 lines and the schemas are the bulk of the
 * surface. Appended into `TOOL_SCHEMAS` there.
 *
 * The report vocabulary is deliberately CLOSED: `blocks` accepts a fixed set
 * of kinds, each pointing at a query the engine runs. There is no field here
 * that takes markup, script or drawing instructions, and the descriptions say
 * so, because a model told it can compose a report will otherwise reach for
 * HTML.
 */
import {
  CHART_KINDS,
  LANE_MARKS,
  LANE_TONES,
  MAX_BLOCKS,
  MAX_LANES,
  MAX_TILES,
  MIN_REFRESH_MS,
  REPORT_BLOCK_KINDS,
  REPORT_REGIONS,
} from '@wellsfargo-starui/data';
import { TARGET_GRID_ID_PROPERTY, INSTANCE_ID_PROPERTY, type OpenAIToolSchema } from './toolSchemaShared';

/** Same shape `query_grid_data` takes, as one nested object. */
const QUERY_PROPERTY = {
  type: 'object',
  description:
    'The analysis to run, same shape as query_grid_data: { columns?, filter?, groupBy?, pivotBy?, aggregate?, sortBy?, limit? }. Column names in the user\'s words are fine — they are resolved against the real columns before anything runs.',
} as const;

export const REPORT_TOOL_SCHEMAS: OpenAIToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'open_analysis_window',
      description:
        'Open one analysis in its own full-size window instead of the chat side panel. Use this when the result will not fit where it lands: a pivot with many columns, a long grouped table, or anything the user wants to keep on screen while they work. The side panel is roughly 337x190px with a fixed height, so a wide cross-tab is unreadable there. The window re-runs the query itself, so it shows current numbers rather than a copy of an earlier result — say that rather than implying the figures match a previous answer.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          query: QUERY_PROPERTY,
          newWindow: {
            type: 'boolean',
            description:
              'Open an ADDITIONAL analysis window instead of reusing this blotter\'s existing one. Use it when the user asks for "another"/"a new"/"a second" window, or wants to compare two cuts side by side — otherwise omit it and the existing window is reused. The reply names the new window\'s id; keep that id and pass it back as windowId to update that same window later.',
          },
          windowId: {
            type: 'string',
            description:
              'Update a specific analysis window that an earlier call reported (e.g. "w2"). Omit to use this blotter\'s main analysis window. Takes precedence over newWindow.',
          },
          chart: {
            type: 'string',
            enum: [...CHART_KINDS],
            description: 'Chart to draw above the table. Omit to let the result\'s shape decide.',
          },
          title: { type: 'string', description: 'Heading for the window, e.g. "Exposure by sector and currency".' },
        },
        required: ['targetGridId', 'query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_live_report',
      description:
        'Compose a full trader report and open it in its own window — a title, headline numbers, charts, tables and narrative laid out together so the reader takes in the whole picture at once, optionally re-running on a cadence. Use this when the user asks for a report, a dashboard, a summary sheet, a daily/close view, or "a holistic view" of something, rather than firing several separate queries. Every number is computed from the blotter\'s rows by the query you attach to each block; you write only the commentary. You cannot supply HTML, SVG, CSS, JavaScript or d3 code, and do not try — the blocks below are the whole vocabulary and they are rendered by trusted components.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          newWindow: {
            type: 'boolean',
            description:
              'Open an ADDITIONAL analysis window instead of reusing this blotter\'s existing one. Use it when the user asks for "another"/"a new"/"a second" window, or wants to compare two cuts side by side — otherwise omit it and the existing window is reused. The reply names the new window\'s id; keep that id and pass it back as windowId to update that same window later.',
          },
          windowId: {
            type: 'string',
            description:
              'Update a specific analysis window that an earlier call reported (e.g. "w2"). Omit to use this blotter\'s main analysis window. Takes precedence over newWindow.',
          },
          title: { type: 'string', description: 'The report\'s headline, e.g. "Rates desk — close".' },
          period: { type: 'string', description: 'What the numbers cover, e.g. "as of the 30 Aug close" or "intraday".' },
          refreshMs: {
            type: 'number',
            description: `Re-run every this many milliseconds. Omit for a static report. Clamped to at least ${MIN_REFRESH_MS}ms — a faster cadence re-queries the whole row set faster than anyone can read it.`,
          },
          blocks: {
            type: 'array',
            description:
              `The composition, in reading order (max ${MAX_BLOCKS}). Each block is { kind, title?, region?, band?, ... }. ` +
              `kind is one of: ${REPORT_BLOCK_KINDS.join(', ')}. ` +
              `region (${REPORT_REGIONS.join(' | ')}, default main) places it: put standing context and identity in "left", the thing that moves in "main", aggregate totals in "right". ` +
              'band is a rotated label in the gutter grouping consecutive blocks that share it ("RISK", "FLOW") — it is what lets a reader take in a section without reading numbers. ' +
              'Blocks: ' +
              '"kpis" { query, tiles: [{ label, column, fn?, signed? }] } — headline figures read off the query\'s first row; set signed:true for P&L so it colours red/green (max ' + MAX_TILES + ' tiles). ' +
              '"chart" { query, chart?, style?, normalize? } — chart is any of: ' + CHART_KINDS.join(', ') + '. For a stacked/grouped/multi-line chart give the query BOTH groupBy and pivotBy: the pivot values become the series. normalize:true makes each stack sum to 100% (share of total rather than absolute size). '  +
              '"table" { query, heatmap? } and "pivot" { query, heatmap? } — heatmap shades numeric cells by magnitude. ' +
              `"lanes" { query, axis, lanes: [{ label, column, mark?, tone?, weight? }] } — several measures stacked as tracks over ONE shared axis (max ${MAX_LANES}); ` +
              `mark is ${LANE_MARKS.join(' | ')} ("state" collapses runs of the same value into blocks), tone is ${LANE_TONES.join(' | ')}, weight (1-4) gives a lane more height. ` +
              'This is the block that makes a report holistic: a spike in one lane lines up with a gap in another, which no set of separate charts can show. Use it whenever the user asks to see several measures over time together. ' +
              '"commentary" { text } — plain text you write, interpreting the numbers the other blocks computed. Never put numbers here that no block computed.',
            items: { type: 'object' },
          },
        },
        required: ['targetGridId', 'title', 'blocks'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reload_analysis_window',
      description:
        'Reload an analysis window you already opened, or reopen it if the user closed it — one tool for both, since you cannot tell which case you are in. It re-runs the window\'s queries against the blotter\'s current rows, so the numbers come back current rather than as they were. Use it when the user says the window is stale, asks you to refresh it, or wants back the report they closed. You do NOT need to re-send the report spec: the window remembers what it was showing. If the window id is unknown, the reply lists the ones that exist.',
      parameters: {
        type: 'object',
        properties: {
          ...TARGET_GRID_ID_PROPERTY,
          ...INSTANCE_ID_PROPERTY,
          windowId: {
            type: 'string',
            description:
              'Which analysis window to reload (e.g. "w2", from the reply that opened it). Omit for this blotter\'s main analysis window.',
          },
        },
        required: ['targetGridId'],
        additionalProperties: false,
      },
    },
  },
];
