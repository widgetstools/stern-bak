/**
 * The shape every tool handler returns.
 *
 * Lives on its own so the handler modules don't have to import from
 * `useToolExecutor.ts` (which imports them — a cycle), and so the type isn't
 * declared twice with the risk of the copies drifting.
 */
export interface ToolExecutionResult {
  /** False sends the model a repairable failure rather than throwing. */
  ok: boolean;
  /** One line the user sees on the tool card, and the model reads back. */
  summary: string;
  /** Structured payload for the model; omitted when the summary says it all. */
  data?: unknown;
}
