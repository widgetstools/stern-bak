import { describe, expectTypeOf, it } from 'vitest';
import type {
  StarGridAppOptions,
  StarGridAppState,
  StarGridHostScope,
  StarGridPersistence,
} from './types';

describe('starGridApp types', () => {
  it('defines persistence and options shapes', () => {
    expectTypeOf<StarGridPersistence>().toEqualTypeOf<'memory' | 'localStorage' | 'config'>();
    expectTypeOf<StarGridHostScope>().toMatchTypeOf<{ gridId: string; instanceId?: string }>();
    expectTypeOf<StarGridAppOptions>().toMatchTypeOf<{ appId: string }>();
    expectTypeOf<StarGridAppState>().toMatchTypeOf<{ theme: 'dark' | 'light' }>();
  });
});
