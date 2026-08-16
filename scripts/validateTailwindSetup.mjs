#!/usr/bin/env node

/**
 * Validates that apps importing @wellsfargo-starui/design-system/css have Tailwind configured.
 *
 * The design-system exports two CSS paths:
 * - ./styles.css: all-in-one (zero Tailwind requirement)
 * - ./css: tokens-only (requires Tailwind + tailwind.config.js)
 *
 * This guard ensures apps using the tokens-only path have the required setup.
 * Fails early with a clear error message if misconfigured.
 */

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = process.cwd();

// Check if app imports the tokens-only CSS path
function appImportsTailwindTokens() {
  const sourcePatterns = [
    'src/**/*.{ts,tsx,js,jsx,css}',
  ];

  const files = globSync(sourcePatterns, { cwd: appRoot });

  return files.some(file => {
    const content = fs.readFileSync(path.join(appRoot, file), 'utf-8');
    return (
      content.includes('@wellsfargo-starui/design-system/css') &&
      !content.includes('@wellsfargo-starui/design-system/styles.css')
    );
  });
}

// Check if app has Tailwind installed
function hasTailwindDependency() {
  const pkgPath = path.join(appRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return 'tailwindcss' in deps;
}

// Check if app has tailwind.config.{js,ts,cjs,cts}
function hasTailwindConfig() {
  const configNames = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.cts'];
  return configNames.some(name => fs.existsSync(path.join(appRoot, name)));
}

// Main validation
const importsTailwind = appImportsTailwindTokens();

if (!importsTailwind) {
  // App doesn't import the tokens-only CSS, no check needed
  process.exit(0);
}

const hasDep = hasTailwindDependency();
const hasConfig = hasTailwindConfig();

if (!hasDep || !hasConfig) {
  const appName = path.basename(appRoot);
  console.error(
    `\n✗ Tailwind setup validation failed for ${appName}\n` +
    `  App imports @wellsfargo-starui/design-system/css (tokens-only) but is missing:\n` +
    (!hasDep ? `  • tailwindcss dependency (add to package.json)\n` : '') +
    (!hasConfig ? `  • tailwind.config.js configuration file\n` : '') +
    `\n  See: docs/latest/getting-started.md#theming\n`
  );
  process.exit(1);
}

process.exit(0);
