# StarUI design rules (scaffold enforcement)

1. Import `@wellsfargo-starui/design-system/css` and `@wellsfargo-starui/grid/styles.css` in globals.css
2. Boot with `applyTheme(getTheme())` before React render
3. Use Tailwind preset from `@wellsfargo-starui/design-system/tailwind`
4. No hardcoded hex/rgb/hsl — use `var(--ds-*)` tokens
5. No native `<input>`, `<textarea>`, `<select>` — use `@wellsfargo-starui/ui`
6. AG Grid theme from `@wellsfargo-starui/design-system/adapters/ag-grid` only
7. Dark + light: every surface works under `[data-theme="dark"]` and `[data-theme="light"]`
