/** @type {import('postcss-load-config').Config} */
module.exports = {
  plugins: {
    // tailwindcss/nesting — handles native CSS nesting BEFORE Tailwind compiles.
    // Required so nested rules in Monaco Editor CSS (pulled in via
    // @wellsfargo-starui/core's ExpressionEditor) don't trigger Vite's
    // "Nested CSS was detected" warning.
    'tailwindcss/nesting': {},
    // Tailwind CSS v3 — processes @tailwind directives and utility classes.
    tailwindcss: {},
    // Autoprefixer — adds vendor prefixes for cross-browser compatibility.
    autoprefixer: {},
  },
};
