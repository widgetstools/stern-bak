# Package Coverage and Sonar LCOV

This note explains how package test coverage is generated for Sonar and what a new package needs so it contributes to the repo-level LCOV file.

## Sonar LCOV Input

Sonar reads one merged LCOV file from the repository root:

```properties
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info
```

That root `coverage/lcov.info` is generated from the individual LCOV files written by package-level Vitest runs.

## Current Coverage Flow

The root `package.json` contains these relevant scripts:

```json
{
  "scripts": {
    "test:coverage": "node scripts/run-test-coverage.mjs",
    "test": "npm run test:packages"
  }
}
```

`scripts/run-test-coverage.mjs` is the package-only coverage path:

1. Runs `npx turbo test` across packages.
2. Passes these Vitest arguments through Turbo to every package `test` script:

    ```bash
    --coverage
    --coverage.reporter=text
    --coverage.reporter=json-summary
    --coverage.reporter=lcov
    ```

3. Each package writes coverage under its own directory:

    ```text
    packages/<bucket>/<package>/coverage/lcov.info
    packages/<bucket>/<package>/coverage/coverage-summary.json
    ```

4. The script scans `packages/**/coverage/lcov.info`.
5. It rewrites LCOV `SF:` source paths to repo-relative paths.
6. It writes the merged Sonar input:

    ```text
    coverage/lcov.info
    ```

`npm test` at the root runs `test:packages` (turbo test across `packages/`). The per-file coverage gate is a separate run — `scripts/run-test-coverage.mjs` (see `docs/COVERAGE_PLAN.md`), which merges LCOV files and prints the Sonar-style coverage estimate.

Turbo is configured in `turbo.json` so the `test` task keeps test and coverage outputs:

```json
{
  "tasks": {
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["junit.xml", "coverage/**"]
    }
  }
}
```

## New Package Requirements

For a new package to produce LCOV and be included in the merged Sonar file, it needs to be in the root npm workspace and have a real Vitest test script.

If the package is added under an existing workspace bucket listed in the root `workspaces` array (`packages/design-system`, `packages/react-grid`, `packages/data`, `packages/openfin`, `packages/react-core`, `packages/types`, `packages/core`), no root workspace change is needed.

If the package is added under a brand-new bucket, add the bucket glob to the root `package.json` `workspaces` array.

## Recommended Package Scripts

Use this as a baseline for a new package `package.json`:

```json
{
  "name": "@wellsfargo-starui/my-new-package",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "rimraf dist tsconfig.tsbuildinfo && tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=lcov"
  },
  "devDependencies": {
    "rimraf": "^6.0.1",
    "typescript": "~5.9.3",
    "vitest": "^4.1.4"
  }
}
```

The required script for the repo-wide flow is:

```json
"test": "vitest run"
```

The root coverage runner adds `--coverage` and the LCOV reporters automatically. The package-level `test:coverage` script is useful for local package-only coverage runs, but the root `npm run test:coverage` flow does not require each package to define it.

Avoid placeholder scripts such as `"test": "echo no tests yet"` for packages that should participate in coverage. `scripts/check-package-coverage.mjs` treats missing or placeholder test scripts as coverage failures.

## Vitest Config for Plain TypeScript Packages

Create `vitest.config.ts` in the package root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx,js,jsx}',
        'src/**/*.spec.{ts,tsx,js,jsx}',
        'src/**/__tests__/**',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
});
```

## Vitest Config for React or DOM Packages

Use `jsdom` for packages that test React components, browser APIs, layout behavior, or DOM interactions:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx,js,jsx}',
        'src/**/*.spec.{ts,tsx,js,jsx}',
        'src/**/__tests__/**',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
});
```

React packages commonly also need these development dependencies:

```json
{
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@testing-library/react": "^16.3.2",
    "@testing-library/dom": "^10.4.0",
    "jsdom": "^29.0.2",
    "react": "~19.2.5",
    "react-dom": "~19.2.5",
    "rimraf": "^6.0.1",
    "typescript": "~5.9.3",
    "vitest": "^4.1.4"
  }
}
```

## Verification Commands

Run coverage for one new package from the repo root:

```bash
npm run test:coverage -- --filter=@wellsfargo-starui/my-new-package
```

Expected outputs:

```text
packages/<bucket>/my-new-package/coverage/lcov.info
packages/<bucket>/my-new-package/coverage/coverage-summary.json
coverage/lcov.info
```

Run full package coverage for Sonar:

```bash
npm run test:coverage
```

Run the fuller unit-test/report path:

```bash
npm test
```

## Checklist for a New Package

- Package directory is included by the root `workspaces` configuration.
- `package.json` has a real `test` script that runs `vitest run`.
- `vitest.config.ts` has `coverage.reporter` including `lcov` and `json-summary`.
- Test files match the configured `include` pattern.
- Source files to be counted are covered by `coverage.include`.
- Generated, test, and intentionally unsupported files are listed in `coverage.exclude`.
- Running the package through root coverage creates package-level `coverage/lcov.info`.
- Root coverage merge creates `coverage/lcov.info` for Sonar.
