// ─── Config Service Database (Dexie / IndexedDB) ────────────────────
//
// This file defines the Dexie database schema for the config service.
// All six tables are defined here with their indexes.
//
// Dexie is a thin wrapper around IndexedDB. It provides:
//   - Typed tables with .get(), .put(), .delete(), .where() methods
//   - Schema versioning for migrations
//   - Compound indexes for multi-field queries
//
// The database name "marketsui-config" is shared across all windows
// in the same OpenFin application. Dexie handles concurrent access
// automatically via IndexedDB's built-in locking.

import Dexie, { type Table } from "dexie";
import type {
  AppConfigRow,
  AppRegistryRow,
  PermissionRow,
  PendingSyncRow,
  RoleRow,
  UserProfileRow,
} from './types';

/**
 * The Dexie database for the config service.
 *
 * Contains six tables that store all application configuration,
 * user data, and sync state. See the types file for the shape
 * of each row.
 *
 * ## Index syntax (Dexie shorthand)
 *
 * - `"configId"`         → primary key on `configId`
 * - `"++id"`             → auto-incrementing primary key
 * - `"appId"`            → secondary index for querying by app
 * - `"[componentType+componentSubType]"` → compound index for
 *   querying configs by type and subtype together
 */
/**
 * Default database name. Tests override via the constructor argument
 * to keep parallel runs (and the upgrade test in particular) isolated.
 */
export const DEFAULT_DB_NAME = "marketsui-config";

export class ConfigDatabase extends Dexie {
  /** Component and template configurations. */
  appConfig!: Table<AppConfigRow>;

  /** Registered applications (one row per deployed app). */
  appRegistry!: Table<AppRegistryRow>;

  /** User profiles with app and role associations. */
  userProfile!: Table<UserProfileRow>;

  /** Role definitions with permission references. */
  roles!: Table<RoleRow>;

  /** Permission definitions (fine-grained access control). */
  permissions!: Table<PermissionRow>;

  /** Queue of failed REST writes waiting to be retried. */
  pendingSync!: Table<PendingSyncRow>;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    super(dbName);

    // v1: original shape (kept so existing browsers can upgrade cleanly).
    this.version(1).stores({
      appConfig: "configId, appId, [componentType+componentSubType], isTemplate",
      appRegistry: "appId",
      userProfile: "userId, appId",
      roles: "roleId",
      permissions: "permissionId, category",
      pendingSync: "++id, tableName, recordId",
    });

    // v2: unified schema. Adds `userId` index on appConfig. Migration
    // renames fields on every existing row: config→payload,
    // createdAt→creationTime, updatedAt→updatedTime, and backfills
    // userId from createdBy so existing rows remain queryable.
    this.version(2)
      .stores({
        appConfig: "configId, appId, userId, [componentType+componentSubType], isTemplate",
        appRegistry: "appId",
        userProfile: "userId, appId",
        roles: "roleId",
        permissions: "permissionId, category",
        pendingSync: "++id, tableName, recordId",
      })
      .upgrade(async (tx) => {
        await tx.table("appConfig").toCollection().modify((row: any) => {
          if (row.config !== undefined && row.payload === undefined) {
            row.payload = row.config;
            delete row.config;
          }
          if (row.createdAt !== undefined && row.creationTime === undefined) {
            row.creationTime = row.createdAt;
            delete row.createdAt;
          }
          if (row.updatedAt !== undefined && row.updatedTime === undefined) {
            row.updatedTime = row.updatedAt;
            delete row.updatedAt;
          }
          if (row.userId === undefined) {
            row.userId = row.createdBy ?? "system";
          }
        });
      });

    // v3: introduce `isPublic` on appConfig (Decision 6). The visibility
    // filter (Session 4) runs in JS, so the field is intentionally NOT
    // indexed — keeping the index list identical to v2 avoids a noop
    // schema-rebuild step. Migration backfills `isPublic = true` on
    // every existing row so reads after upgrade match pre-redesign
    // behaviour exactly.
    this.version(3)
      .stores({
        appConfig: "configId, appId, userId, [componentType+componentSubType], isTemplate",
        appRegistry: "appId",
        userProfile: "userId, appId",
        roles: "roleId",
        permissions: "permissionId, category",
        pendingSync: "++id, tableName, recordId",
      })
      .upgrade(async (tx) => {
        await tx.table("appConfig").toCollection().modify((row: any) => {
          if (row.isPublic === undefined) {
            row.isPublic = true;
          }
        });
      });

    // v4: drop the deprecated `isRegisteredComponent` field on appConfig
    // (Session 16 / Decision 13 trim pass). `isTemplate` is now the sole
    // canonical template flag — the back-compat alias is gone from
    // writes, and any row that still carries it from a pre-cleanup
    // session has the field stripped on read so consumer code can stop
    // probing for it. No index changes; data-only migration.
    this.version(4)
      .stores({
        appConfig: "configId, appId, userId, [componentType+componentSubType], isTemplate",
        appRegistry: "appId",
        userProfile: "userId, appId",
        roles: "roleId",
        permissions: "permissionId, category",
        pendingSync: "++id, tableName, recordId",
      })
      .upgrade(async (tx) => {
        await tx.table("appConfig").toCollection().modify((row: any) => {
          if (row.isRegisteredComponent !== undefined) {
            delete row.isRegisteredComponent;
          }
        });
      });
  }
}
