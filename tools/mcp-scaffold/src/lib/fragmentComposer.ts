import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { renderTemplate } from './templateEngine.js';
import { templatesDir } from './paths.js';
import { lintDesignCompliance, type DesignFile } from './designLinter.js';

export interface FragmentEntry {
  from: string;
  to: string;
}

export interface TemplateManifest {
  id: string;
  fragments: FragmentEntry[];
  copyDirs?: Array<{ from: string; to: string }>;
  copyFiles?: Array<{ from: string; to: string }>;
}

export interface ComposeContext {
  appName: string;
  appId: string;
  bootstrapErrorTitle: string;
  packageName: string;
  port: number;
  worker: boolean;
  includesStompServer: boolean;
  includesOpenFin: boolean;
  gridFeatures: Record<string, unknown>;
  gridPropsLines: string[];
  tarballDeps: Record<string, string>;
  userId: string;
  gridId: string;
}

export interface ComposeResult {
  files: DesignFile[];
  writtenPaths: string[];
}

function readFragment(relativePath: string): string {
  const base = join(templatesDir(), 'fragments');
  const hbsPath = join(base, `${relativePath}.hbs`);
  const plainPath = join(base, relativePath);
  if (existsSync(hbsPath)) return readFileSync(hbsPath, 'utf8');
  if (existsSync(plainPath)) return readFileSync(plainPath, 'utf8');
  throw new Error(`Fragment not found: ${relativePath}`);
}

export function loadTemplateManifest(templateId: string): TemplateManifest {
  const path = join(templatesDir(), 'manifests', `${templateId}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as TemplateManifest;
}

export function composeTemplate(
  manifest: TemplateManifest,
  outputDir: string,
  context: ComposeContext,
): ComposeResult {
  const writtenPaths: string[] = [];
  const files: DesignFile[] = [];

  for (const entry of manifest.fragments) {
    const raw = readFragment(entry.from);
    const content = entry.from.endsWith('.hbs')
      ? renderTemplate(raw, context as unknown as Record<string, unknown>)
      : raw;

    const target = join(outputDir, entry.to);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    writtenPaths.push(entry.to);
    if (/\.(tsx?|css)$/.test(entry.to)) {
      files.push({ path: entry.to, content });
    }
  }

  if (manifest.copyDirs) {
    const staticBase = join(templatesDir(), 'static');
    for (const dir of manifest.copyDirs) {
      const src = join(staticBase, dir.from);
      const dest = join(outputDir, dir.to);
      if (!existsSync(src)) continue;
      copyDirRecursive(src, dest);
      collectDesignFiles(dest, outputDir, files, writtenPaths);
    }
  }

  if (manifest.copyFiles) {
    const staticBase = join(templatesDir(), 'static');
    for (const file of manifest.copyFiles) {
      const src = join(staticBase, file.from);
      const dest = join(outputDir, file.to);
      if (!existsSync(src)) continue;
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(src));
      writtenPaths.push(file.to);
      if (/\.(tsx?|css)$/.test(file.to)) {
        files.push({ path: file.to, content: readFileSync(src, 'utf8') });
      }
    }
  }

  return { files, writtenPaths };
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDirRecursive(s, d);
    else {
      mkdirSync(dirname(d), { recursive: true });
      writeFileSync(d, readFileSync(s));
    }
  }
}

function collectDesignFiles(dir: string, outputDir: string, files: DesignFile[], written: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectDesignFiles(full, outputDir, files, written);
      continue;
    }
    const rel = relative(outputDir, full);
    if (/\.(tsx?|css)$/.test(rel)) {
      files.push({ path: rel, content: readFileSync(full, 'utf8') });
      written.push(rel);
    }
  }
}

export function validateComposedDesign(files: DesignFile[]): ReturnType<typeof lintDesignCompliance> {
  return lintDesignCompliance(files);
}
