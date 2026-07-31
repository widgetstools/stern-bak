/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@wellsfargo-starui/platform/scripts/staruiTailwindPreset.cjs';
import { demoAppTailwindContent } from '@wellsfargo-starui/platform/scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...demoAppTailwindContent,
  ],
};
