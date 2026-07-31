import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { Module } from 'ag-grid-community';
import { installAgGridSetFilterValidateGuard } from './agGridSetFilterValidateGuard';

let _registered = false;

/**
 * Register AG Grid enterprise modules once per page session.
 * When `modules` is omitted, registers the full {@link AllEnterpriseModule}
 * bundle (backward-compatible default). Hosts may pass a subset for embed
 * scenarios that don't need every enterprise feature.
 */
export function ensureAgGridModules(modules?: readonly Module[]): void {
  if (_registered) return;
  ModuleRegistry.registerModules([...(modules ?? [AllEnterpriseModule])]);
  installAgGridSetFilterValidateGuard();
  _registered = true;
}

/** @internal test helper */
export function resetAgGridModuleRegistrationForTest(): void {
  _registered = false;
}
