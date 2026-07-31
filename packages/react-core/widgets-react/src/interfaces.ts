/**
 * Dependency injection interfaces for widget data and actions.
 * These are injected via BlotterProvider, NOT imported directly.
 */

import type { IDataProvider } from '@wellsfargo-starui/host-data';

/**
 * @deprecated Use {@link IDataProvider} from `@wellsfargo-starui/host-data` instead.
 * Kept as a type alias for legacy BlotterProvider injection sites.
 */
export type IBlotterDataProvider = IDataProvider;

/**
 * IActionRegistry — interface for registering and executing toolbar actions.
 */
export interface IActionRegistry {
  execute(actionId: string, context: Record<string, unknown>): void;
  getAvailableActions(): Array<{ id: string; label: string; icon?: string }>;
}
