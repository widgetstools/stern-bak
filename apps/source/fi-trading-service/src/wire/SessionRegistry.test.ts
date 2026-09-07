import { describe, expect, it, vi } from 'vitest';

import { SessionRegistry } from './SessionRegistry.js';
import type { StompSession } from './StompSession.js';

function fakeSession(id: string) {
  return { id, onLiveTick: vi.fn(), close: vi.fn() } as unknown as StompSession;
}

describe('SessionRegistry', () => {
  it('mints unique ids', () => {
    const registry = new SessionRegistry();
    const ids = new Set([registry.nextId(), registry.nextId(), registry.nextId()]);
    expect(ids.size).toBe(3);
  });

  it('tracks membership', () => {
    const registry = new SessionRegistry();
    const session = fakeSession('a');
    registry.add(session);
    expect(registry.size).toBe(1);
    registry.remove('a');
    expect(registry.size).toBe(0);
  });

  it('drives a tick across every session', () => {
    const registry = new SessionRegistry();
    const a = fakeSession('a');
    const b = fakeSession('b');
    registry.add(a);
    registry.add(b);
    registry.tickAll();
    expect(a.onLiveTick).toHaveBeenCalledTimes(1);
    expect(b.onLiveTick).toHaveBeenCalledTimes(1);
  });

  it('closes every session and empties, so shutdown is deterministic', () => {
    const registry = new SessionRegistry();
    const a = fakeSession('a');
    registry.add(a);
    registry.closeAll();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });
});
