import { describe, expect, it } from 'vitest';
import { ResourceScope } from './ResourceScope';

describe('ResourceScope', () => {
  it('lazily creates css, expression, cache, and dirty resources', () => {
    const scope = new ResourceScope('grid-1', {
      appData: { get: (_name, key) => (key === 'foo' ? 1 : undefined) },
    });
    const css = scope.css('mod-a');
    const cssAgain = scope.css('mod-a');
    expect(cssAgain).toBe(css);

    const engine = scope.expression();
    expect(scope.expression()).toBe(engine);

    const cache = scope.cache<object, number>('rows');
    cache.set({}, 1);
    expect(scope.cache<object, number>('rows').get({})).toBeUndefined();
    expect(scope.dirty()).toBeDefined();
    expect(scope.appData()?.get('providers', 'foo')).toBe(1);
  });

  it('dispose tears down css injectors and blocks further use', () => {
    const scope = new ResourceScope('grid-2');
    scope.css('mod-a');
    scope.dirty().set('x', true);
    scope.dispose();
    expect(() => scope.css('mod-a')).toThrow(/used after dispose/);
    expect(() => scope.expression()).toThrow(/used after dispose/);
  });

  it('dispose is idempotent', () => {
    const scope = new ResourceScope('grid-3');
    scope.dispose();
    expect(() => scope.dispose()).not.toThrow();
  });
});
