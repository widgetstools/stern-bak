/** @type {import('tailwindcss').Config} */
// TARBALL TRACK — the preset comes from the INSTALLED design-system package,
// not from the platform repo's scripts/. Content globs scan the installed dist
// so utility classes used inside shipped components are still generated.
// NOTE: this is a NAMED export. The package ships no default export, so the
// natural `import preset from '.../tailwind'` yields undefined and Tailwind
// dies with "Cannot read properties of undefined (reading 'future')" pointing
// at an unrelated CSS file. Worth adding a default export upstream.
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../node_modules/@wellsfargo-starui/*/dist/**/*.{js,mjs}',
    './node_modules/@wellsfargo-starui/*/dist/**/*.{js,mjs}',
  ],
};
