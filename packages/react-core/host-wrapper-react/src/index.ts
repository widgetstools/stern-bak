/**
 * @wellsfargo-starui/host-wrapper-react — Seam #2 from docs/ARCHITECTURE.md.
 *
 * The single component-side seam between a hosted React component and
 * the surrounding runtime / persistence / theme choices.
 *
 * Usage:
 *
 *   import { HostWrapper, useHost } from '@wellsfargo-starui/host-wrapper-react';
 *   import { BrowserRuntime } from '@wellsfargo-starui/runtime-browser';
 *   import { createConfigManager } from '@wellsfargo-starui/host-config';
 *
 *   const runtime = new BrowserRuntime({ identity: { appId, userId } });
 *   const configManager = createConfigManager({ configServiceRestUrl: baseUrl });
 *
 *   <HostWrapper runtime={runtime} configManager={configManager}>
 *     <YourComponent />
 *   </HostWrapper>
 *
 *   // Inside YourComponent:
 *   const { instanceId, theme, configManager, onThemeChanged } = useHost();
 */

export { HostWrapper, type HostWrapperProps } from './HostWrapper.js';
export { HostContext, useHost, type HostContextValue } from './HostContext.js';
