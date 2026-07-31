/**
 * OpenFin workspace shell plugin for StarGridApp.
 *
 * In OpenFin runtime contexts, call `initWorkspace` during app boot.
 * In plain browser dev, the plugin no-ops.
 */
import type { StarGridPlugin } from '@wellsfargo-starui/host';
import { initWorkspace } from './workspace.js';

declare const fin: { Platform?: { getCurrentSync?: () => unknown } } | undefined;

export const openFinPlatformPlugin: StarGridPlugin = {
  id: 'openfin-platform',
  async register() {
    if (typeof fin === 'undefined' || !fin.Platform?.getCurrentSync) return;
    await initWorkspace();
  },
};
