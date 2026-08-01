import type { AnyModule } from './types';

/**
 * Topologically sort modules by declared `dependencies`. Ties (modules at
 * the same depth) are broken by `priority` (ascending). Throws on missing
 * dependencies, cycles, or duplicate ids.
 */
export function topoSortModules(modules: readonly AnyModule[]): AnyModule[] {
  const byId = new Map<string, AnyModule>();
  for (const m of modules) {
    if (byId.has(m.id)) {
      throw new Error(`[platform] Duplicate module id "${m.id}"`);
    }
    byId.set(m.id, m);
  }

  // Validate deps exist.
  for (const m of modules) {
    for (const depId of m.dependencies ?? []) {
      if (!byId.has(depId)) {
        throw new Error(`[platform] Module "${m.id}" depends on missing module "${depId}"`);
      }
    }
  }

  // Kahn's algorithm with priority tiebreak.
  const indegree = new Map<string, number>();
  const reverseEdges = new Map<string, string[]>(); // depId → [modules that depend on it]
  for (const m of modules) {
    indegree.set(m.id, (m.dependencies ?? []).length);
    for (const depId of m.dependencies ?? []) {
      const list = reverseEdges.get(depId) ?? [];
      list.push(m.id);
      reverseEdges.set(depId, list);
    }
  }

  const ready: AnyModule[] = [];
  for (const m of modules) if (indegree.get(m.id) === 0) ready.push(m);
  ready.sort(byPriority);

  const sorted: AnyModule[] = [];
  while (ready.length > 0) {
    const next = ready.shift()!;
    sorted.push(next);
    const dependents = reverseEdges.get(next.id) ?? [];
    const newlyReady: AnyModule[] = [];
    for (const id of dependents) {
      const n = (indegree.get(id) ?? 0) - 1;
      indegree.set(id, n);
      if (n === 0) newlyReady.push(byId.get(id)!);
    }
    if (newlyReady.length > 0) {
      newlyReady.sort(byPriority);
      ready.push(...newlyReady);
      ready.sort(byPriority);
    }
  }

  if (sorted.length !== modules.length) {
    const remaining = modules.filter((m) => !sorted.includes(m)).map((m) => m.id);
    throw new Error(`[platform] Cycle detected involving modules: ${remaining.join(', ')}`);
  }

  return sorted;
}

function byPriority(a: AnyModule, b: AnyModule): number {
  return a.priority - b.priority;
}
