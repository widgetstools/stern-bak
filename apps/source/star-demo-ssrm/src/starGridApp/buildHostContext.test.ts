import { describe, expect, it } from 'vitest';
import {
  buildGridHostContext,
  storageFactoryForPersistence,
  defineStarGridPlugin,
} from './buildHostContext';
import {
  defineStarGridPlugin as pluginDefine,
} from './plugins';

describe('buildHostContext re-exports', () => {
  it('re-exports host helpers', () => {
    expect(buildGridHostContext).toBeDefined();
    expect(storageFactoryForPersistence).toBeDefined();
    expect(defineStarGridPlugin).toBeDefined();
  });
});

describe('plugins re-exports', () => {
  it('re-exports defineStarGridPlugin', () => {
    expect(pluginDefine).toBe(defineStarGridPlugin);
  });
});
