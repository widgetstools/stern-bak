import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { templatesDir } from '../lib/paths.js';
import { lintDesignCompliance } from '../lib/designLinter.js';
import { UI_RECIPES } from '../resources/uiRecipes.js';

function readFragmentFile(relativePath: string): string {
  const base = join(templatesDir(), 'fragments');
  const full = join(base, relativePath);
  return readFileSync(full, 'utf8');
}

export function handleAddUiComponent(opts: {
  projectDir: string;
  component: string;
  targetPath?: string;
}) {
  const recipe = UI_RECIPES.find((r) => r.id === opts.component);
  if (!recipe) {
    throw new Error(`Unknown UI recipe: ${opts.component}. Use starui_list_ui_components.`);
  }
  const target = join(opts.projectDir, opts.targetPath ?? recipe.defaultTarget);
  if (existsSync(target)) {
    throw new Error(`Target already exists: ${target}`);
  }
  const content = readFragmentFile(recipe.fragmentPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  const violations = lintDesignCompliance([{ path: target, content }]);
  return { written: target, recipe: recipe.id, violations };
}
