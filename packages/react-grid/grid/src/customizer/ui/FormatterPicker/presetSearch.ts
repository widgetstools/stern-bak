import type { FormatterPreset } from './presetsForDataType';

/** Lowercased haystack for a preset: its label, hint, and format code. */
function searchableText(p: FormatterPreset): string {
  const t = p.template;
  const code =
    t.kind === 'excelFormat'
      ? t.format
      : t.kind === 'tick'
        ? t.tick
        : t.kind === 'expression'
          ? t.expression
          : t.kind === 'preset'
            ? t.preset
            : '';
  return `${p.label} ${p.hint ?? ''} ${code}`.toLowerCase();
}

/**
 * Filter presets by a free-text query across label, hint, and format code.
 * An empty/blank query returns `[]` — the caller shows the tabbed view
 * instead of a flat result list.
 */
export function filterPresets(
  presets: ReadonlyArray<FormatterPreset>,
  query: string,
): FormatterPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return presets.filter((p) => searchableText(p).includes(q));
}
