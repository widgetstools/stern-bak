/**
 * Component-type + scope constants shared by the config store and the
 * AppData store. A LEAF module on purpose: the two stores used to
 * import these from each other, forming the package's only runtime
 * module cycle.
 */

/** Rows owned by the platform rather than a user. */
export const PUBLIC_USER_ID = 'system';
/** ConfigManager componentType for data-provider rows. */
export const COMPONENT_TYPE_DATA_PROVIDER = 'data-provider';
/** ConfigManager componentType for AppData rows. */
export const COMPONENT_TYPE_APPDATA = 'appdata';
