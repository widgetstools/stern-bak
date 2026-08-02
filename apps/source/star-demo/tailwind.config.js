/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@wellsfargo-starui/platform/scripts/staruiTailwindPreset.cjs';
import { platformAppTailwindContent } from '@wellsfargo-starui/platform/scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...platformAppTailwindContent,
  ],
};
