/**
 * ActionContext — context passed to toolbar action handlers.
 */
export interface ActionContext {
  selectedRows: Record<string, unknown>[];
  selectedRow: Record<string, unknown> | null;
  configId: string;
  userId: string;
  [key: string]: unknown;
}
