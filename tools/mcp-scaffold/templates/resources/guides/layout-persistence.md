# Layout persistence

MarketsGrid **layouts** persist via `withStorage` + `ConfigManager`:

- **Key:** `(appId, userId, instanceId, gridId)`
- **Storage:** localStorage (browser) or ConfigService (OpenFin)
- **On disk:** `config/layouts/*.layout.json` (wire format `kind: gc-profile`)
- **Export:** customizer → grid-state module → snapshot → Import/Export in layout selector

Use `starui_layout_recipe` for storage key shape and `starui_generate_layout` to author new layouts.

Provider selection is **not** part of a layout — it lives in `gridLevelData`.
