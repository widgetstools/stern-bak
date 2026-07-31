/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * REST base URL of the config-service backend (no trailing slash).
   * Example: `http://localhost:3001/api/v1`.
   *
   * When unset or empty, the demo runs in Dexie-only mode — all reads
   * and writes hit IndexedDB. When set, ConfigManager writes go to
   * REST first then mirror to Dexie; reads still come from Dexie.
   *
   * See `.env.example` for setup.
   */
  readonly VITE_CONFIG_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
