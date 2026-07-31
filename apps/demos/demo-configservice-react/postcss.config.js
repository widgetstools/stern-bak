/**
 * PostCSS config. `tailwindcss/nesting` handles Monaco Editor's
 * nested CSS before Tailwind compiles — prevents the noisy
 * "Nested CSS was detected" warning from `vite:css`.
 */
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
