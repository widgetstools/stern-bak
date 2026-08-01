/**
 * Typecheck-only declarations for the untyped `postcss.config.js`
 * (imported by src/buildConfig.test.ts). Shape mirrors the actual export.
 */
declare const config: {
  plugins: Record<string, Record<string, unknown>>;
};
export default config;
