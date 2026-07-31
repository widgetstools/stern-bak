/**
 * v2 Provider Editor — public surface.
 *
 * Pulled in by the popout entry (`apps/markets-ui-react-reference/src/
 * data-providers-popout.tsx`) and by the dock's "Tools → Data Providers"
 * launcher.
 */

export { cloneProviderConfig, copyNameFrom } from './cloneProviderConfig.js';
export {
  exportProviderConfig,
  parseProviderConfigImport,
  toPortableProviderConfig,
} from './providerConfigIo.js';
export type { PortableProviderConfig } from './providerConfigIo.js';
export { DataProviderEditor } from './DataProviderEditor.js';
export type { DataProviderEditorProps } from './DataProviderEditor.js';
export { EditorForm } from './EditorForm.js';
export type { EditorFormProps } from './EditorForm.js';
export { useProviderProbe } from './useProviderProbe.js';
export type { ProbeState } from './useProviderProbe.js';
