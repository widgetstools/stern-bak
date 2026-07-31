import { describe, expect, it } from 'vitest';
import { deriveSingletonConfigId, type RegistryEntry } from './registryConfigTypes.js';
import { validateEntry, validateSingletonUniqueness } from './registryValidate.js';

const hostEnv = { appId: 'TestApp', configServiceUrl: 'http://localhost:3001/api/v1' };

function validEntry(over: Partial<RegistryEntry> = {}): Partial<RegistryEntry> {
  return {
    id: 'e1',
    displayName: 'Trade Blotter',
    hostUrl: 'http://localhost:5174/view',
    componentType: 'grid',
    componentSubType: 'trade',
    type: 'internal',
    usesHostConfig: true,
    appId: hostEnv.appId,
    configServiceUrl: hostEnv.configServiceUrl,
    configId: 'grid-trade',
    singleton: false,
    ...over,
  };
}

describe('validateEntry', () => {
  it('returns no errors for a valid usesHostConfig entry', () => {
    expect(validateEntry(validEntry(), hostEnv)).toEqual([]);
  });

  it('rejects missing required text fields', () => {
    const errors = validateEntry(
      validEntry({
        displayName: '  ',
        hostUrl: '',
        componentType: undefined,
        componentSubType: '   ',
      }),
      hostEnv,
    );
    expect(errors.map((e) => e.field).sort()).toEqual([
      'componentSubType',
      'componentType',
      'displayName',
      'hostUrl',
    ]);
  });

  it('rejects an invalid type enum', () => {
    const errors = validateEntry(validEntry({ type: 'widget' as RegistryEntry['type'] }), hostEnv);
    expect(errors).toContainEqual({
      field: 'type',
      message: "Must be 'internal' or 'external'",
    });
  });

  it('rejects a non-boolean usesHostConfig', () => {
    const errors = validateEntry(
      validEntry({ usesHostConfig: undefined }),
      hostEnv,
    );
    expect(errors).toContainEqual({
      field: 'usesHostConfig',
      message: 'Required (true or false)',
    });
  });

  it('rejects hostEnv mismatch when usesHostConfig is true', () => {
    const errors = validateEntry(
      validEntry({ appId: 'Other', configServiceUrl: 'http://evil' }),
      hostEnv,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'appId' }),
        expect.objectContaining({ field: 'configServiceUrl' }),
      ]),
    );
  });

  it('skips hostEnv equality when hostEnv is omitted', () => {
    // Without hostEnv we cannot assert equality — skip, don't invent errors.
    expect(
      validateEntry(validEntry({ appId: 'Other', configServiceUrl: 'http://evil' })),
    ).toEqual([]);
  });

  it('requires appId when usesHostConfig is false', () => {
    const errors = validateEntry(
      validEntry({ usesHostConfig: false, appId: '  ', configServiceUrl: '' }),
      hostEnv,
    );
    expect(errors).toContainEqual({
      field: 'appId',
      message: 'Required when usesHostConfig === false',
    });
  });

  it('allows empty configServiceUrl when usesHostConfig is false', () => {
    expect(
      validateEntry(
        validEntry({
          usesHostConfig: false,
          appId: 'ExternalApp',
          configServiceUrl: '',
        }),
        hostEnv,
      ),
    ).toEqual([]);
  });

  it('rejects a singleton whose configId does not match the derivation', () => {
    const expected = deriveSingletonConfigId('grid', 'trade');
    const errors = validateEntry(
      validEntry({ singleton: true, configId: 'wrong-id' }),
      hostEnv,
    );
    expect(errors).toContainEqual({
      field: 'configId',
      message: `Singleton configId must be "${expected}"`,
    });
  });

  it('accepts a singleton with the derived configId', () => {
    const expected = deriveSingletonConfigId('grid', 'trade');
    expect(
      validateEntry(validEntry({ singleton: true, configId: expected }), hostEnv),
    ).toEqual([]);
  });
});

describe('validateSingletonUniqueness', () => {
  const entry = (
    id: string,
    over: Partial<RegistryEntry> = {},
  ): RegistryEntry =>
    ({
      id,
      displayName: id,
      hostUrl: 'http://x',
      componentType: 'grid',
      componentSubType: 'trade',
      type: 'internal',
      usesHostConfig: true,
      appId: 'TestApp',
      configServiceUrl: 'http://localhost',
      configId: deriveSingletonConfigId('grid', 'trade'),
      singleton: true,
      ...over,
    }) as RegistryEntry;

  it('flags a later singleton that collides on componentType+subType', () => {
    const errors = validateSingletonUniqueness(
      [entry('a'), entry('b')],
      'TestApp',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('componentSubType');
    expect(errors[0].message).toContain('collides with entry a');
  });

  it('ignores singletons belonging to a different appId', () => {
    expect(
      validateSingletonUniqueness(
        [entry('a'), entry('b', { appId: 'OtherApp' })],
        'TestApp',
      ),
    ).toEqual([]);
  });

  it('ignores non-singleton entries even when types collide', () => {
    expect(
      validateSingletonUniqueness(
        [
          entry('a', { singleton: false }),
          entry('b', { singleton: false }),
        ],
        'TestApp',
      ),
    ).toEqual([]);
  });
});
