/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@wellsfargo-starui/platform/scripts/staruiTailwindPreset.cjs';
import { demoAppTailwindContent } from '@wellsfargo-starui/platform/scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // Shared lab modules rendered by this app (sidebar, tab shell, drawer).
    '../markets-grid-lab/src/**/*.{ts,tsx}',
    ...demoAppTailwindContent,
  ],
};
