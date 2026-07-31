import { describe, expect, it } from 'vitest';
import {
  DEV_PLATFORM_BOOTSTRAP,
  validatePlatformBootstrapConfig,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';

describe('validatePlatformBootstrapConfig', () => {
  const valid: PlatformBootstrapConfig = {
    appId: 'markets-ui-dev',
    userId: 'dev1',
    useRest: false,
    seedConfigUrl: '/seed-config.json',
  };

  it('accepts a minimal valid config', () => {
    const result = validatePlatformBootstrapConfig(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects empty appId', () => {
    const result = validatePlatformBootstrapConfig({ ...valid, appId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('appId is required and must be non-empty');
  });

  it('rejects whitespace-only appId', () => {
    const result = validatePlatformBootstrapConfig({ ...valid, appId: '   ' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('appId is required and must be non-empty');
  });

  it('rejects empty userId', () => {
    const result = validatePlatformBootstrapConfig({ ...valid, userId: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('userId is required and must be non-empty');
  });

  it('warns when useRest is true without configServiceRestUrl', () => {
    const result = validatePlatformBootstrapConfig({
      ...valid,
      useRest: true,
      configServiceRestUrl: undefined,
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      'useRest is true but configServiceRestUrl is missing',
    );
  });

  it('does not warn when useRest is true and REST URL is set', () => {
    const result = validatePlatformBootstrapConfig({
      ...valid,
      useRest: true,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('DEV_PLATFORM_BOOTSTRAP validates for tests', () => {
    expect(validatePlatformBootstrapConfig(DEV_PLATFORM_BOOTSTRAP).valid).toBe(true);
    expect(DEV_PLATFORM_BOOTSTRAP.appId).toBe('TestApp');
    expect(DEV_PLATFORM_BOOTSTRAP.userId).toBe('dev1');
  });
});
