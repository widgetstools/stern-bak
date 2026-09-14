import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { Module } from 'ag-grid-community';
import { installAgGridSetFilterValidateGuard } from './agGridSetFilterValidateGuard';

let _registered = false;

/** AG Grid's two bundle modules; unpacked so single members can be left out. */
const BUNDLE_MODULES: ReadonlySet<string> = new Set(['AllEnterprise', 'AllCommunity']);

/**
 * Members of {@link AllEnterpriseModule} the platform does not register.
 *
 * `Find` — nothing in the platform uses the Find feature, and its service
 * subscribes `rowNodeDataChanged` on every client-side grid with a debounce
 * that arms one `clearTimeout` + one `setTimeout` per updated row: half of
 * the 189 490 `setTimeout` calls per 10 s measured on one docked blotter
 * (WORKLOG 21; refactor plan B0). The other half comes from ag-grid-react's
 * `RenderStatusService`, gated on the column-autosize service — that module
 * stays registered because the column menu's "Autosize" items need it.
 */
export const EXCLUDED_AG_GRID_MODULES: readonly string[] = ['Find'];

/**
 * Every module {@link AllEnterpriseModule} carries, minus `exclude`. The
 * bundles are unpacked one level; real modules keep their own `dependsOn`,
 * which `ModuleRegistry` resolves as usual.
 */
export function platformAgGridModules(exclude: readonly string[] = EXCLUDED_AG_GRID_MODULES): Module[] {
  const out = new Map<string, Module>();
  const visit = (m: Module): void => {
    if (BUNDLE_MODULES.has(m.moduleName)) {
      for (const dep of m.dependsOn ?? []) visit(dep);
      return;
    }
    if (!exclude.includes(m.moduleName)) out.set(m.moduleName, m);
  };
  visit(AllEnterpriseModule);
  return [...out.values()];
}

/**
 * Register AG Grid modules once per page session. When `modules` is omitted,
 * registers {@link platformAgGridModules} — the enterprise bundle minus
 * {@link EXCLUDED_AG_GRID_MODULES}. Hosts may pass a subset for embed
 * scenarios that don't need every enterprise feature.
 */
export function ensureAgGridModules(modules?: readonly Module[]): void {
  if (_registered) return;
  ModuleRegistry.registerModules([...(modules ?? platformAgGridModules())]);
  installAgGridSetFilterValidateGuard();
  _registered = true;
}

/** @internal test helper */
export function resetAgGridModuleRegistrationForTest(): void {
  _registered = false;
}
