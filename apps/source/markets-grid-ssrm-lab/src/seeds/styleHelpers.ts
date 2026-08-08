import type { ThemedCellStyleOverrides } from '@wellsfargo-starui/core';

/** Theme-aware cell/header background + text (shared by lab seeds). */
export function bgText(
  bgDark: string,
  bgLight: string,
  fgDark: string,
  fgLight: string,
): ThemedCellStyleOverrides {
  return {
    dark: { colors: { background: bgDark, text: fgDark } },
    light: { colors: { background: bgLight, text: fgLight } },
  };
}
