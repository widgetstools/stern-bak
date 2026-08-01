/**
 * The Dexie tables the Config Browser knows how to display.
 * Order defines the left-sidebar order.
 */
export type ConfigBrowserTableKey =
  | 'appConfig'
  | 'appRegistry'
  | 'userProfile'
  | 'roles'
  | 'permissions'
  | 'pendingSync';

/** @deprecated Use `ConfigBrowserTableKey` — kept for config-browser compat. */
export type TableKey = ConfigBrowserTableKey;

export interface ConfigBrowserTableMeta {
  key: ConfigBrowserTableKey;
  label: string;
  primaryKey: string;
  scopable: boolean;
  description: string;
}

/** @deprecated Use `ConfigBrowserTableMeta` */
export type TableMeta = ConfigBrowserTableMeta;

export const CONFIG_BROWSER_TABLES: readonly ConfigBrowserTableMeta[] = [
  {
    key: 'appConfig',
    label: 'App Config',
    primaryKey: 'configId',
    scopable: true,
    description: 'Component configurations (templates + instances).',
  },
  {
    key: 'appRegistry',
    label: 'App Registry',
    primaryKey: 'appId',
    scopable: false,
    description: 'Registered apps. Always global.',
  },
  {
    key: 'userProfile',
    label: 'User Profiles',
    primaryKey: 'userId',
    scopable: true,
    description: 'User ↔ app ↔ role mappings.',
  },
  {
    key: 'roles',
    label: 'Roles',
    primaryKey: 'roleId',
    scopable: false,
    description: 'Role definitions. Always global.',
  },
  {
    key: 'permissions',
    label: 'Permissions',
    primaryKey: 'permissionId',
    scopable: false,
    description: 'Permission definitions. Always global.',
  },
  {
    key: 'pendingSync',
    label: 'Pending Sync',
    primaryKey: 'id',
    scopable: false,
    description: 'Queued REST writes waiting to be retried.',
  },
] as const;

/** @deprecated Use `CONFIG_BROWSER_TABLES` */
export const TABLES = CONFIG_BROWSER_TABLES;
