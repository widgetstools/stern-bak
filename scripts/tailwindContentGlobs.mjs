/**
 * Static Tailwind content globs (relative paths only — safe for PostCSS/jiti).
 * Pick the helper that matches app depth under `apps/`.
 */

/** apps/<name>/ — e.g. demo-react, markets-ui-react-reference (3 levels to repo root) */
export const platformAppTailwindContent = [
  '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
  '../../packages/react-grid/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../node_modules/@wellsfargo-starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/grid/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../node_modules/@wellsfargo-starui/grid/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../node_modules/@wellsfargo-starui/grid/grid/src/**/*.{ts,tsx}',
];

/** apps/demos/<name>/ or apps/demos/<name>/ (3 levels to repo root) */
export const demoAppTailwindContent = [
  '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../packages/react-core/host-data-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/widgets-react/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../../node_modules/@wellsfargo-starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/grid/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../../node_modules/@wellsfargo-starui/grid/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../../node_modules/@wellsfargo-starui/grid/grid/src/**/*.{ts,tsx}',
];

/** External tarball consumers (MCP templates) — scan installed package trees only. */
export const externalConsumerTailwindContent = [
  './node_modules/@wellsfargo-starui/ui/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/ui/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/react-ui/ui/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-ui/ui/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/react-grid/grid/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-grid/grid/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/grid/grid/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/workspace-setup-react/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/react-core/workspace-setup-react/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/grid/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/grid/config-browser/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/grid/config-browser/src/**/*.{ts,tsx}',
  './node_modules/@wellsfargo-starui/react-core/config-browser/dist/**/*.{js,mjs}',
  './node_modules/@wellsfargo-starui/react-core/config-browser/src/**/*.{ts,tsx}',
];
