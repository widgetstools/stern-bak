/**
 * Services barrel — framework-agnostic clients for managing data-provider
 * configuration metadata (CRUD over the unified-config REST API).
 */
export {
  DataProviderConfigService,
  dataProviderConfigService,
  type DataProviderLocalBackend,
} from './dataProviderConfigService';
