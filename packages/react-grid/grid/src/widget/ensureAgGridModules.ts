import { enableDevValidations, ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { Module } from 'ag-grid-community';
import { installAgGridSetFilterValidateGuard } from './agGridSetFilterValidateGuard';

let _registered = false;
let _devValidations = false;

/**
 * Register AG Grid enterprise modules once per page session.
 * When `modules` is omitted, registers the full {@link AllEnterpriseModule}
 * bundle (backward-compatible default). Hosts may pass a subset for embed
 * scenarios that don't need every enterprise feature.
 *
 * AG Grid 36+: {@link ValidationModule} is no longer part of All* bundles —
 * enable full console diagnostics in development via {@link enableDevValidations}.
 * @see https://www.ag-grid.com/react-data-grid/upgrading-to-ag-grid-36/
 */
export function ensureAgGridModules(modules?: readonly Module[]): void {
  if (!_devValidations && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    try {
      enableDevValidations();
      _devValidations = true;
    } catch {
      /* optional in environments without the export */
    }
  }
  if (_registered) return;
  ModuleRegistry.registerModules([...(modules ?? [AllEnterpriseModule])]);
  installAgGridSetFilterValidateGuard();
  _registered = true;
}

/** @internal test helper */
export function resetAgGridModuleRegistrationForTest(): void {
  _registered = false;
  _devValidations = false;
}
