import { enableDevValidations, ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';

let providerEditorAgGridModulesReady = false;

/** One-shot registration for Data Provider editor embedded grids (Columns tab, AppData, …). */
export function ensureProviderEditorAgGridModules(): void {
  if (providerEditorAgGridModulesReady) return;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    try {
      enableDevValidations();
    } catch {
      /* optional */
    }
  }
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  providerEditorAgGridModulesReady = true;
}
