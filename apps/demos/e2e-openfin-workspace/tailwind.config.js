/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '../../../scripts/staruiTailwindPreset.cjs';
import { platformAppTailwindContent } from '../../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}', ...platformAppTailwindContent],
};
