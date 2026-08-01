import { LOGGED_IN_USER_ID, type IdentitySnapshot } from '@wellsfargo-starui/types';

const ROLE_DELIM = ',';

export interface IdentityOverrides {
  readonly instanceId?: string;
  readonly appId?: string;
  readonly userId?: string;
  readonly componentType?: string;
  readonly componentSubType?: string;
  readonly isTemplate?: boolean;
  readonly singleton?: boolean;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly customData?: Readonly<Record<string, unknown>>;
}

function readListParam(params: URLSearchParams, name: string): readonly string[] | undefined {
  const raw = params.get(name);
  if (raw === null) return undefined;
  if (raw === '') return [];
  return raw.split(ROLE_DELIM).map((s) => s.trim()).filter(Boolean);
}

function readCustomDataParam(params: URLSearchParams): Readonly<Record<string, unknown>> | undefined {
  const raw = params.get('data');
  if (raw === null) return undefined;
  try {
    const decoded = atob(raw);
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    /* malformed payload */
  }
  return undefined;
}

export function resolveBrowserIdentity(
  search: string | URLSearchParams,
  overrides: IdentityOverrides = {},
  randomUUID: () => string = () => crypto.randomUUID(),
): IdentitySnapshot {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const customDataFromUrl = readCustomDataParam(params);
  const customData: Readonly<Record<string, unknown>> = {
    ...(overrides.customData ?? {}),
    ...(customDataFromUrl ?? {}),
  };

  return {
    instanceId: params.get('instanceId') ?? overrides.instanceId ?? `browser-${randomUUID()}`,
    appId: params.get('appId') ?? overrides.appId ?? '',
    userId: LOGGED_IN_USER_ID,
    componentType: params.get('componentType') ?? overrides.componentType ?? '',
    componentSubType: params.get('componentSubType') ?? overrides.componentSubType ?? '',
    isTemplate: params.get('isTemplate') === 'true' || overrides.isTemplate === true,
    singleton: params.get('singleton') === 'true' || overrides.singleton === true,
    roles: readListParam(params, 'roles') ?? overrides.roles ?? [],
    permissions: readListParam(params, 'permissions') ?? overrides.permissions ?? [],
    customData,
  };
}
