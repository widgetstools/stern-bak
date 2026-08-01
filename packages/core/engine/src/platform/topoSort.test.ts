import { describe, expect, it } from 'vitest';
import { topoSortModules } from './topoSort';
import type { AnyModule } from './types';

function mod(id: string, deps: string[] = [], priority = 0): AnyModule {
  return {
    id,
    name: id,
    schemaVersion: 1,
    priority,
    dependencies: deps,
    getInitialState: () => ({}),
    serialize: (s) => s,
    deserialize: (raw) => raw ?? {},
  };
}

describe('topoSortModules', () => {
  it('orders dependencies before dependents and breaks ties by priority', () => {
    const sorted = topoSortModules([
      mod('b', ['a'], 10),
      mod('a', [], 0),
      mod('c', ['a'], 5),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('throws on duplicate module ids', () => {
    expect(() => topoSortModules([mod('a'), mod('a')])).toThrow(/Duplicate module id/);
  });

  it('throws when a dependency is missing', () => {
    expect(() => topoSortModules([mod('a', ['missing'])])).toThrow(/missing module/);
  });

  it('throws when a cycle is present', () => {
    expect(() =>
      topoSortModules([mod('a', ['b']), mod('b', ['a'])]),
    ).toThrow(/Cycle detected/);
  });
});
