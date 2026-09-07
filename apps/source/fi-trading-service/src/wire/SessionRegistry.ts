/**
 * Every live session on this process.
 *
 * Exists so shutdown is deterministic: a server that closes its listener but
 * leaves sessions holding interval timers keeps the event loop alive and
 * makes `SIGTERM` look like a hang.
 */

import type { StompSession } from './StompSession.js';

export class SessionRegistry {
  private readonly sessions = new Map<string, StompSession>();
  private seq = 0;

  nextId(): string {
    this.seq += 1;
    return `s-${Date.now().toString(36)}-${this.seq}`;
  }

  add(session: StompSession): void {
    this.sessions.set(session.id, session);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  /** Drive one live tick across every session. */
  tickAll(): void {
    for (const session of this.sessions.values()) session.onLiveTick();
  }

  closeAll(): void {
    for (const session of [...this.sessions.values()]) session.close();
    this.sessions.clear();
  }
}
