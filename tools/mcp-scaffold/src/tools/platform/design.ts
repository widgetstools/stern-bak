import { handleValidateDesignCompliance } from '../validateDesignCompliance.js';
import { UI_RECIPES } from '../../resources/uiRecipes.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { templatesDir } from '../../lib/paths.js';

export function handleAuditAppDesign(opts: { projectDir: string }) {
  const compliance = handleValidateDesignCompliance(opts);
  const extras: string[] = [];
  const main = existsSync(join(opts.projectDir, 'src/main.tsx'))
    ? readFileSync(join(opts.projectDir, 'src/main.tsx'), 'utf8')
    : '';
  const css = existsSync(join(opts.projectDir, 'src/globals.css'))
    ? readFileSync(join(opts.projectDir, 'src/globals.css'), 'utf8')
    : existsSync(join(opts.projectDir, 'src/index.css'))
      ? readFileSync(join(opts.projectDir, 'src/index.css'), 'utf8')
      : '';

  if (!main.includes('applyTheme')) extras.push('main.tsx should call applyTheme(getTheme())');
  if (!css.includes("@import '@wellsfargo-starui/design-system/css'")) extras.push('Missing design-system CSS import');
  if (!css.includes("@import '@wellsfargo-starui/grid/styles.css'")) extras.push('Missing grid styles CSS import');

  return {
    ...compliance,
    recommendations: extras,
    agGridThemeNote: 'MarketsGrid uses @wellsfargo-starui/design-system/adapters/ag-grid via useGridTheme()',
  };
}

export function handleAddShellLayout(opts: { projectDir: string; recipes?: string[] }) {
  const ids = opts.recipes ?? ['theme-toggle', 'status-strip', 'app-menubar'];
  const written: string[] = [];
  for (const id of ids) {
    const recipe = UI_RECIPES.find((r) => r.id === id);
    if (!recipe) continue;
    const src = readFileSync(join(templatesDir(), 'fragments', recipe.fragmentPath), 'utf8');
    const dest = join(opts.projectDir, recipe.defaultTarget);
    mkdirSync(join(dest, '..'), { recursive: true });
    if (!existsSync(dest)) {
      writeFileSync(dest, src, 'utf8');
      written.push(recipe.defaultTarget);
    }
  }
  return { written, note: 'Import components into App.tsx header/shell' };
}

export function handleThemePlaygroundSnippet() {
  return {
    snippet: `import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { Button } from '@wellsfargo-starui/ui';

// Boot (main.tsx):
applyTheme(getTheme());

// Toggle:
applyTheme({ theme: getTheme().theme === 'dark' ? 'light' : 'dark' });

// AG Grid follows [data-theme] via MarketsGrid useGridTheme() → agGridDarkTheme / agGridLightTheme
`,
    imports: ['@wellsfargo-starui/design-system', '@wellsfargo-starui/ui'],
  };
}

export function handleShadcnComponentPicker(description: string) {
  const d = description.toLowerCase();
  const picks: string[] = [];
  if (/dialog|modal|confirm/.test(d)) picks.push('Dialog', 'AlertDialog');
  if (/drawer|sheet|panel|help/.test(d)) picks.push('Sheet', 'ScrollArea');
  if (/menu|menubar|nav/.test(d)) picks.push('Menubar', 'DropdownMenu');
  if (/form|input|select|switch/.test(d)) picks.push('Form', 'Input', 'Select', 'Switch', 'Label');
  if (/table|list/.test(d)) picks.push('Table', 'ScrollArea');
  if (/toast|notification/.test(d)) picks.push('SonnerToaster', 'useToast');
  if (picks.length === 0) picks.push('Button', 'Card', 'Tabs');
  return {
    description,
    recommended: [...new Set(picks)],
    importFrom: '@wellsfargo-starui/ui',
    rule: 'Never use native input/textarea/select — use @wellsfargo-starui/ui shadcn primitives',
  };
}
