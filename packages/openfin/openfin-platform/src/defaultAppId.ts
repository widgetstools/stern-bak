/**
 * Fallback appId when neither manifest customData nor the registry
 * supplies one. A LEAF module on purpose — `platformBootstrap` and
 * `registryHostEnv` both need it, and importing it from either of
 * them created the package's only runtime module cycle.
 */
export const DEFAULT_APP_ID = 'TestApp';
