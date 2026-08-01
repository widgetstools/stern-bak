import type { ProfileSnapshot, StorageAdapter } from './StorageAdapter';

/** In-memory storage. Tests and hosts that don't need durability. */
export class MemoryAdapter implements StorageAdapter {
  private profiles = new Map<string, ProfileSnapshot>();
  private gridLevelData = new Map<string, unknown>();

  private key(gridId: string, id: string): string {
    return `${gridId}::${id}`;
  }

  async loadProfile(gridId: string, id: string): Promise<ProfileSnapshot | null> {
    return this.profiles.get(this.key(gridId, id)) ?? null;
  }

  async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
    this.profiles.set(this.key(snapshot.gridId, snapshot.id), snapshot);
  }

  async deleteProfile(gridId: string, id: string): Promise<void> {
    this.profiles.delete(this.key(gridId, id));
  }

  async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
    const out: ProfileSnapshot[] = [];
    const prefix = `${gridId}::`;
    for (const [k, v] of this.profiles) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }

  async loadGridLevelData(gridId: string): Promise<unknown | null> {
    return this.gridLevelData.has(gridId) ? this.gridLevelData.get(gridId) : null;
  }

  async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
    this.gridLevelData.set(gridId, data);
  }
}
