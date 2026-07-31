// ─────────────────────────────────────────────────────────────
//  PrimeNG Preset — StarUI v1 Azure palette (PrimeNG 20/21)
//  Mirrors starui-design-system/primeng/starui-primeng-preset.ts
// ─────────────────────────────────────────────────────────────

import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const primengPreset = definePreset(Aura, {
  primitive: {
    azure: {
      50: 'oklch(0.97 0.02 250)', 100: 'oklch(0.93 0.05 250)', 200: 'oklch(0.87 0.08 250)',
      300: 'oklch(0.79 0.12 250)', 400: 'oklch(0.68 0.17 252)', 500: 'oklch(0.555 0.225 256)',
      600: 'oklch(0.545 0.225 254)', 700: 'oklch(0.47 0.20 254)', 800: 'oklch(0.39 0.16 256)',
      900: 'oklch(0.32 0.12 258)', 950: 'oklch(0.22 0.08 260)',
    },
  },
  semantic: {
    primary: {
      50: '{azure.50}', 100: '{azure.100}', 200: '{azure.200}', 300: '{azure.300}',
      400: '{azure.400}', 500: '{azure.500}', 600: '{azure.600}', 700: '{azure.700}',
      800: '{azure.800}', 900: '{azure.900}', 950: '{azure.950}',
    },
    extend: {
      buy: { color: 'oklch(0.52 0.105 192)', contrastColor: '#fff' },
      sell: { color: 'oklch(0.515 0.205 12)', contrastColor: '#fff' },
      positive: { color: 'oklch(0.53 0.105 192)' },
      negative: { color: 'oklch(0.525 0.205 12)' },
    },
    colorScheme: {
      light: {
        primary: {
          color: '{azure.600}', contrastColor: 'oklch(0.99 0.015 250)',
          hoverColor: '{azure.700}', activeColor: '{azure.800}',
        },
        surface: {
          0: '#ffffff', 50: 'oklch(0.986 0.009 67)', 100: 'oklch(0.962 0.015 67)',
          200: 'oklch(0.934 0.020 67)', 300: 'oklch(0.896 0.020 67)', 400: 'oklch(0.80 0.024 67)',
          500: 'oklch(0.62 0.022 67)', 600: 'oklch(0.505 0.018 67)', 700: 'oklch(0.40 0.014 67)',
          800: 'oklch(0.30 0.008 67)', 900: 'oklch(0.24 0.008 67)', 950: 'oklch(0.16 0.006 67)',
        },
        extend: {
          buy: { color: 'oklch(0.52 0.105 192)', contrastColor: '#fff' },
          sell: { color: 'oklch(0.515 0.205 12)', contrastColor: '#fff' },
          positive: { color: 'oklch(0.53 0.105 192)' }, negative: { color: 'oklch(0.525 0.205 12)' },
        },
      },
      dark: {
        primary: {
          color: '{azure.500}', contrastColor: 'oklch(0.99 0.02 252)',
          hoverColor: '{azure.400}', activeColor: '{azure.300}',
        },
        surface: {
          0: '#ffffff', 50: 'oklch(0.96 0.006 258)', 100: 'oklch(0.86 0.008 258)',
          200: 'oklch(0.70 0.015 258)', 300: 'oklch(0.525 0.022 258)', 400: 'oklch(0.425 0.020 258)',
          500: 'oklch(0.355 0.019 258)', 600: 'oklch(0.260 0.023 258)', 700: 'oklch(0.217 0.020 258)',
          800: 'oklch(0.203 0.0185 258)', 900: 'oklch(0.176 0.017 258)', 950: 'oklch(0.13 0.012 258)',
        },
        extend: {
          buy: { color: 'oklch(0.76 0.135 192)', contrastColor: 'oklch(0.16 0.05 195)' },
          sell: { color: 'oklch(0.70 0.19 12)', contrastColor: 'oklch(0.16 0.06 14)' },
          positive: { color: 'oklch(0.78 0.135 192)' }, negative: { color: 'oklch(0.71 0.19 12)' },
        },
      },
    },
  },
});
