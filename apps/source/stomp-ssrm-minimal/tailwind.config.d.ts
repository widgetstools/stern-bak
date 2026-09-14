/**
 * Typecheck-only declarations for the untyped `tailwind.config.js`
 * (imported by src/buildConfig.test.ts). Uses tailwind's own Config type,
 * matching the `@type {import('tailwindcss').Config}` annotation in the .js.
 */
import type { Config } from 'tailwindcss';

declare const config: Config;
export default config;
