import type { ExternalFilterColumns } from './types';

/**
 * Per-grid registry behind {@link ExternalFilterColumns}: each owner (a
 * module id) declares the columns its external filter reads; the apply path
 * reads the union. Nothing declared means the active external filter cannot
 * be attributed and every updated row still rides a transaction (plan B2).
 */
export class ExternalFilterColumnRegistry implements ExternalFilterColumns {
  private readonly byOwner = new Map<string, readonly string[]>();
  private union: readonly string[] | null = null;

  declare(owner: string, columns: readonly string[] | null): void {
    if (columns === null) this.byOwner.delete(owner);
    else this.byOwner.set(owner, [...new Set(columns)]);
    this.union = null;
  }

  columns(): readonly string[] | null {
    if (this.byOwner.size === 0) return null;
    if (this.union === null) {
      const all = new Set<string>();
      for (const cols of this.byOwner.values()) for (const c of cols) all.add(c);
      this.union = [...all];
    }
    return this.union;
  }

  /** Forget every declaration. Called by GridPlatform.destroy(). */
  clear(): void {
    this.byOwner.clear();
    this.union = null;
  }
}
