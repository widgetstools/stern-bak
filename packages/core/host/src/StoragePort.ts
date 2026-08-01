import type { ProfileSnapshot } from '@wellsfargo-starui/types';

/**
 * StoragePort — profile persistence for a grid instance.
 * Default implementation: localStorage bundle (phase 3 grid package).
 */
export interface StoragePort {
  loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null>;
  saveProfile(snapshot: ProfileSnapshot): Promise<void>;
  deleteProfile(gridId: string, profileId: string): Promise<void>;
  listProfiles(gridId: string): Promise<ProfileSnapshot[]>;
  loadGridLevelData?(gridId: string): Promise<unknown | null>;
  saveGridLevelData?(gridId: string, data: unknown): Promise<void>;
  subscribeToChanges?(gridId: string, fn: () => void): () => void;
}

/** Factory for scoped storage (appId, userId, instanceId). */
export interface StoragePortFactory {
  (scope: { appId: string; userId: string; instanceId?: string }): StoragePort;
}
