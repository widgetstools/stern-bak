// ─────────────────────────────────────────────────────────────
//  Tailwind Preset — OKLCH StarUI tokens (v1)
//  Colors reference bare OKLCH components in starui-tokens.css.
// ─────────────────────────────────────────────────────────────

import primeui from 'tailwindcss-primeui';
import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

/** OKLCH bare components in starui-tokens.css — `<alpha-value>` enables `/80`, `/50`, etc. */
const oklch = (v: string) => `oklch(var(${v}) / <alpha-value>)`;

export const tailwindPreset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      /* Map Tailwind text-* utilities to StarUI density tokens (not browser rem). */
      fontSize: {
        '2xs': ['var(--text-2xs)', { lineHeight: '1.4' }],
        xs:    ['var(--text-xs)', { lineHeight: '1.4' }],
        sm:    ['var(--text-sm)', { lineHeight: '1.45' }],
        base:  ['var(--text-base)', { lineHeight: '1.5' }],
        md:    ['var(--text-md)', { lineHeight: '1.5' }],
        lg:    ['var(--text-lg)', { lineHeight: '1.45' }],
        xl:    ['var(--text-xl)', { lineHeight: '1.35' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '1.25' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '1.2' }],
      },
      height: {
        control:     'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
      },
      minHeight: {
        control:     'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
      },
      width: {
        control:     'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
      },
      minWidth: {
        control:     'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
      },
      size: {
        control:     'var(--control-h)',
        'control-sm': 'var(--control-h-sm)',
        'control-lg': 'var(--control-h-lg)',
      },
      colors: {
        background: oklch('--background'),
        foreground: oklch('--foreground'),
        card: {
          DEFAULT: oklch('--card'),
          foreground: oklch('--card-foreground'),
        },
        popover: {
          DEFAULT: oklch('--popover'),
          foreground: oklch('--popover-foreground'),
        },
        primary: {
          DEFAULT: oklch('--primary'),
          foreground: oklch('--primary-foreground'),
        },
        secondary: {
          DEFAULT: oklch('--secondary'),
          foreground: oklch('--secondary-foreground'),
        },
        muted: {
          DEFAULT: oklch('--muted'),
          foreground: oklch('--muted-foreground'),
        },
        accent: {
          DEFAULT: oklch('--accent'),
          foreground: oklch('--accent-foreground'),
        },
        destructive: {
          DEFAULT: oklch('--destructive'),
          foreground: oklch('--destructive-foreground'),
        },
        success: {
          DEFAULT: oklch('--positive'),
          foreground: oklch('--buy-foreground'),
        },
        warning: {
          DEFAULT: oklch('--warning'),
          foreground: oklch('--warning-foreground'),
        },
        info: {
          DEFAULT: oklch('--info'),
          foreground: oklch('--info-foreground'),
        },
        buy: {
          DEFAULT: oklch('--buy'),
          foreground: oklch('--buy-foreground'),
        },
        sell: {
          DEFAULT: oklch('--sell'),
          foreground: oklch('--sell-foreground'),
        },
        positive: oklch('--positive'),
        negative: oklch('--negative'),
        border: oklch('--border'),
        'border-strong': oklch('--border-strong'),
        input: oklch('--input'),
        ring: oklch('--ring'),

        surface: {
          50:  oklch('--surface-50'),
          100: oklch('--surface-100'),
          200: oklch('--surface-200'),
          300: oklch('--surface-300'),
          400: oklch('--surface-400'),
          500: oklch('--surface-500'),
          600: oklch('--surface-600'),
          700: oklch('--surface-700'),
          800: oklch('--surface-800'),
          900: oklch('--surface-900'),
          950: oklch('--surface-950'),
        },
      },
      boxShadow: {
        card:    'var(--shadow-card)',
        overlay: 'var(--shadow-overlay)',
        glow:    'var(--ds-elevation-glow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate, primeui],
};
