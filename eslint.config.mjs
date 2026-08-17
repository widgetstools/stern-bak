// Root ESLint flat config for the starui monorepo.
//
// Scope: lints package source under `packages/**` only. Apps, e2e suites,
// build scripts, and generated output are intentionally out of scope here —
// they have their own toolchains (Vite/Angular/Playwright) and would only add
// noise to the platform-library guardrail this config exists to provide.
//
// Severity philosophy (see docs/blotter-performance-roadmap.md sibling plan):
//   - Architecture import boundaries  -> `error` (the rules
//     docs/latest/architecture.md describe as non-negotiable).
//   - Style / size / `any` ceilings   -> `warn` (large pre-existing backlog;
//     surfaced for incremental cleanup, never blocks CI on day one).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// ── Architecture buckets (see docs/latest/packages.md) ───────────────────
const FOUNDATION_GLOBS = [
  'packages/design-system/design-system/**/*.{ts,tsx}',
  'packages/design-system/icons-svg/**/*.{ts,tsx}',
  'packages/types/shared-types/**/*.{ts,tsx}',
];
const ENGINE_GLOBS = ['packages/core/engine/**/*.{ts,tsx}'];
const REACT_GRID_GLOBS = ['packages/react-grid/**/*.{ts,tsx}'];
const OPENFIN_GLOBS = ['packages/openfin/**/*.{ts,tsx}'];

// ── Customizer modules: no direct row-model access ──────────────────────
//
// Both halves of every module — `core/engine` holds state + transforms,
// `react-grid/grid` the React + AG-Grid runtime — because a rule scoped to
// the engine alone would police the half with the fewest violations.
const CUSTOMIZER_MODULE_GLOBS = [
  'packages/core/engine/src/customizer/modules/**/*.{ts,tsx}',
  'packages/react-grid/grid/src/customizer/modules/**/*.{ts,tsx}',
];

// The AG-Grid APIs that answer "what rows are there" from the CLIENT-side
// row model, paired with the `platform.data` method that answers the same
// question for both. A module reaching for the left column silently means
// "whatever this grid happens to hold", which under the server-side row
// model is a ~2,000-row window of a possibly-100,000-row dataset.
//
// `no-restricted-properties`, NOT `no-restricted-syntax`: the core rules
// REPLACE rather than merge across config objects, and the native-element
// block below already owns `no-restricted-syntax` for every `.tsx` under
// `packages/react-grid/**` — which includes module panels. A second
// `no-restricted-syntax` entry here would silently switch the native
// `<input>` / `<select>` / `<textarea>` checks off for exactly those files.
const ROW_MODEL_APIS = [
  ['forEachNode', 'platform.data.scan(visit)'],
  ['forEachNodeAfterFilter', "platform.data.scan(visit, { scope: 'filtered' })"],
  ['applyTransactionAsync', 'platform.data.mutate(patches)'],
  ['getDisplayedRowAtIndex', 'platform.data.getRowsInRange(start, end)'],
  ['getDisplayedRowCount', 'platform.data.count()'],
];

const ROW_MODEL_RESTRICTIONS = ROW_MODEL_APIS.map(([property, replacement]) => ({
  property,
  message:
    `\`${property}\` reads the client-side row model, so it sees only the rows this grid `
    + `happens to hold. Use \`${replacement}\`, which answers for both row models. `
    + `If this call is genuinely about the grid's DISPLAY rather than the dataset — a `
    + `viewport anchor, a baseline the session has observed — disable this rule on the `
    + `line with a comment saying which.`,
}));

// Anything that is NOT one of the specially-scoped buckets above. Kept in sync
// so every package file matches exactly one `no-restricted-imports` config
// (the core rule replaces rather than merges across config objects).
const DEFAULT_IGNORES = [
  ...FOUNDATION_GLOBS,
  ...ENGINE_GLOBS,
  ...REACT_GRID_GLOBS,
  ...OPENFIN_GLOBS,
];

// Foundation packages may only depend on each other (design-system, types —
// the collapsed names; icons-svg lives inside design-system, shared-types
// inside types). The extglob excludes those two.
const NON_FOUNDATION_STARUI = {
  group: [
    '@wellsfargo-starui/!(design-system|types)',
    '@wellsfargo-starui/!(design-system|types)/**',
  ],
  message:
    'Foundation packages (design-system, types) may only import each other.',
};

// The engine (@wellsfargo-starui/core's `.` entry) is the framework-agnostic
// platform; it must never reach up into a framework adapter. Grid subpaths
// (./widgets, ./config-browser) and react subpaths ride on the bare-name
// globs' `/**` variants.
const FRAMEWORK_ADAPTERS = {
  group: [
    '@wellsfargo-starui/grid',
    '@wellsfargo-starui/grid/**',
    '@wellsfargo-starui/react',
    '@wellsfargo-starui/react/**',
  ],
  message:
    'The engine (@wellsfargo-starui/core) must not import from framework adapters (grid/react).',
};

const OPENFIN_CORE = {
  group: ['@openfin/*'],
  message:
    'Only @wellsfargo-starui/openfin may import @openfin/*. Inject OpenFin behaviour via a port/callback instead.',
};

// OpenFin bucket sits *below* the React core bucket; it must not import React UI.
const APP_REVERSE_DEP = {
  group: ['@wellsfargo-starui/react', '@wellsfargo-starui/react/**'],
  message:
    '@wellsfargo-starui/openfin must not depend on @wellsfargo-starui/react (reverse layer dependency). Move shared contracts down to @wellsfargo-starui/types or @wellsfargo-starui/core/host.',
};

const restrict = (...patterns) => ['error', { patterns }];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts',
      'libs/**',
      'apps/**',
      'e2e/**',
      'e2e-openfin/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/**',
      'tools/**',
      'docs/**',
    ],
  },

  // ── Base rules for every package source file ───────────────────────────
  {
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      unicorn,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // React correctness — kept as `warn` so the large existing backlog of
      // intentional `eslint-disable-next-line react-hooks/exhaustive-deps`
      // suppressions resolves cleanly without blocking CI.
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'unicorn/filename-case': [
        'warn',
        { cases: { camelCase: true, pascalCase: true } },
      ],
    },
  },

  // Native form controls in React packages must use the shadcn/Radix
  // primitives from @wellsfargo-starui/react (Input, Textarea, Select, Checkbox, Slider).
  // Carve-outs: hidden `type="file"` pickers and the `type="color"`
  // eyedropper have no shadcn equivalent and are allowed; the shadcn
  // primitive library itself (react-core/ui) is excluded.
  {
    files: [
      'packages/react-grid/**/*.tsx',
      'packages/react-core/**/*.tsx',
    ],
    ignores: [
      'packages/react-core/ui/**',
      'packages/react-grid/grid/src/customizer/ui/shadcn/**',
      'packages/**/*.{test,spec}.tsx',
      'packages/**/__tests__/**/*.tsx',
      'packages/**/__mocks__/**/*.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            'Use Select/SelectTrigger/SelectContent/SelectItem from @wellsfargo-starui/react instead of a native <select>.',
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: 'Use Textarea from @wellsfargo-starui/react instead of a native <textarea>.',
        },
        {
          selector:
            "JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type'] Literal[value=/^(file|color)$/]))",
          message:
            'Use Input/Checkbox/Slider/Select from @wellsfargo-starui/react instead of a native <input>. Native <input> is only allowed for type="file" and type="color".',
        },
      ],
    },
  },

  // Tests/specs have legitimately large `describe`/setup bodies — exempt them
  // from the size + filename ceilings (still linted for `any`).
  {
    files: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'packages/**/test/**/*.{ts,tsx}',
      'packages/**/__tests__/**/*.{ts,tsx}',
      'packages/**/__mocks__/**/*.{ts,tsx}',
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'unicorn/filename-case': 'off',
    },
  },

  // Filename-case carve-outs: shadcn-generated kebab files and the Angular
  // buckets (Angular Style Guide mandates kebab).
  {
    files: [
      'packages/react-core/ui/src/components/**/*.{ts,tsx}',
      'packages/react-grid/grid/src/customizer/ui/shadcn/**/*.{ts,tsx}',
      'packages/data/host-data-angular/**/*.{ts,tsx}',
    ],
    rules: { 'unicorn/filename-case': 'off' },
  },

  // ── Import-boundary zones (mutually exclusive by directory) ────────────
  {
    files: FOUNDATION_GLOBS,
    rules: { 'no-restricted-imports': restrict(NON_FOUNDATION_STARUI, OPENFIN_CORE) },
  },
  {
    files: ENGINE_GLOBS,
    rules: { 'no-restricted-imports': restrict(FRAMEWORK_ADAPTERS, OPENFIN_CORE) },
  },
  {
    files: REACT_GRID_GLOBS,
    rules: { 'no-restricted-imports': restrict(OPENFIN_CORE) },
  },
  {
    files: OPENFIN_GLOBS,
    rules: { 'no-restricted-imports': restrict(APP_REVERSE_DEP) },
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: DEFAULT_IGNORES,
    rules: { 'no-restricted-imports': restrict(OPENFIN_CORE) },
  },

  // Binding constraint 3 of the SSRM parity effort, made mechanical: no
  // customizer module reads or writes the row model directly. Tests are
  // exempt — a module's own suite legitimately drives a stub grid api.
  {
    files: CUSTOMIZER_MODULE_GLOBS,
    ignores: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'packages/**/__tests__/**',
      'packages/**/__mocks__/**',
    ],
    rules: {
      'no-restricted-properties': ['error', ...ROW_MODEL_RESTRICTIONS],
    },
  },
);
