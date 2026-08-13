import { describe, expect, it } from 'vitest';
import { defineStarGridPlugin } from './plugins';

describe('plugins', () => {
  it('re-exports defineStarGridPlugin from host', () => {
    const plugin = defineStarGridPlugin({ id: 'test', register: () => {} });
    expect(plugin).toEqual({ id: 'test', register: expect.any(Function) });
  });
});
