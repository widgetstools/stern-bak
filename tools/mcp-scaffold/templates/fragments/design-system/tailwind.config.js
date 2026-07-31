import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [tailwindPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};
