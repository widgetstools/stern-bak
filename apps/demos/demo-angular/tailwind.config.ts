import type { Config } from 'tailwindcss';
import { tailwindPreset } from '../../../scripts/staruiTailwindPreset.cjs';

export default {
  presets: [tailwindPreset as any],
  content: ['./src/**/*.{html,ts}'],
} satisfies Config;
