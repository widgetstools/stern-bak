/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './src/**/*.{ts,tsx}',
  ],
};
