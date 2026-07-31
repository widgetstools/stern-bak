/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';
import { platformAppTailwindContent } from '../../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...platformAppTailwindContent,
  ],
};
