import type { UserConfig } from 'vite';

export function appDirFromConfig(importMetaUrl: string): string;

export function staruiConsumerViteConfig(
  appDir: string,
  opts?: { worker?: boolean },
): UserConfig;
