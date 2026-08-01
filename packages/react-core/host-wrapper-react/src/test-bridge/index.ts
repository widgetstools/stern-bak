/**
 * `@wellsfargo-starui/react/host/test-bridge` — dev-only test plumbing.
 *
 * Apps gate on `import.meta.env.DEV` before importing this subpath so
 * the bundle stays out of production builds. See `install.ts` for
 * the full contract.
 */

export { installTestBridge } from './install.js';
