/**
 * PostCSS config.
 *
 * `tailwindcss/nesting` (bundled with Tailwind) runs BEFORE Tailwind and
 * handles native CSS nesting syntax. Without it, Vite's PostCSS pipeline
 * warns when it sees nested rules from Monaco Editor CSS
 * (e.g. `.monaco-editor .hintsWidget { .warningMessage p { ... } }`).
 */
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
  },
};
