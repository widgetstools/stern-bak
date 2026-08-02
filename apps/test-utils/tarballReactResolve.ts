import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vitest/config';

/** Pin React to the tarball app's isolated node_modules install. */
export function tarballReactResolve(appImportMeta: ImportMeta): UserConfig['resolve'] {
  const appRoot = dirname(fileURLToPath(appImportMeta.url));
  const nm = join(appRoot, 'node_modules');
  return {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      react: join(nm, 'react'),
      'react-dom': join(nm, 'react-dom'),
      'react/jsx-runtime': join(nm, 'react/jsx-runtime'),
      'react-dom/client': join(nm, 'react-dom/client'),
    },
  };
}
