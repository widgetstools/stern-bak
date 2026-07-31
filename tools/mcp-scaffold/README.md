# @wellsfargo-starui/mcp-scaffold

**StarUI Platform MCP** — scaffold apps, wire STOMP, diagnose empty grids, author **grid layouts**, OpenFin routes, design compliance.

## Terminology

| User-facing | Wire format |
|-------------|-------------|
| **layout** | `kind: gc-profile` export in `config/layouts/*.layout.json` |
| layout selector | Profile dropdown → Import in MarketsGrid |

Grid behavior (renderers, smart-edit, styling) → **layouts**. Host wiring (routes, dataServices, OpenFin) → **scaffold code**.

## Run

```bash
npx -y ./libs/starui-mcp-scaffold-0.3.0-<sha>.tgz
```

## Decision workflow

1. **`starui_config_or_code`** — describe the feature → get `layout` vs `code` vs `both`
2. **`starui_generate_layout`** — build importable layout JSON
3. **`starui_validate_layout`** — check before commit
4. **`starui_import_layout_pack`** — copy curated packs from `apps/grid-config`

## Layout tools

| Tool | Purpose |
|------|---------|
| `starui_config_or_code` | Route feature requests to layout JSON or scaffold code |
| `starui_generate_layout` | Create `gc-profile` layout for a `gridId` |
| `starui_validate_layout` | Validate layout JSON |
| `starui_import_layout_pack` | Copy starter layouts to `config/layouts/` |
| `starui_layout_recipe` | Storage key + config dir conventions |
| `starui_explain_layout_module` | Module schemaVersion reference |

## Common questions

| Question | Tool |
|----------|------|
| Why is my grid empty? | `starui_diagnose_data_plane` |
| How do I wire STOMP? | `starui_setup_stomp_dev` + `starui_generate_stomp_config` |
| Heatmap on notional? | `starui_config_or_code` → `starui_generate_layout` |

## MCP resources

- `starui://guides/layout-persistence`
- `starui://guides/wire-stomp`
- `starui://troubleshooting/empty-grid`

## Pack

`npm run pack:mcp` from repo root.
