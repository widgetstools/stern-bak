# Angular Core (bucket 8)

Angular product shells and tools. **Shipped as one bundled tarball**
(`@wellsfargo-starui/angular-core`) containing:

| Subfolder | Workspace package | Import subpath |
|---|---|---|
| `app/` | `@wellsfargo-starui/app-angular` | `@wellsfargo-starui/angular-core/app` |
| `widgets/` | `@wellsfargo-starui/widgets-angular` | `@wellsfargo-starui/angular-core/widgets` |
| `config-browser/` | `@wellsfargo-starui/config-browser-angular` | `@wellsfargo-starui/angular-core/config-browser` |

Grid lives in `packages/angular-grid/` (`@wellsfargo-starui/grid-angular`, separate tarball).
Data adapters in `packages/data/`.

## Tarball install

```json
"@wellsfargo-starui/angular-core": "file:../libs/starui-angular-core-0.1.0-<sha8>.tgz"
```

See `libs/manifest.json` for the current hashed filename.

## Import rules

- Must **not** import from `packages/react-*`.
- Vanilla core: `@wellsfargo-starui/engine`, `@wellsfargo-starui/host`, etc. (`packages/shared/`).
- Data: `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-config` (`packages/data/`).
- UI: **PrimeNG** + `@wellsfargo-starui/tokens-primeng` (scaffold under `packages/angular-ui/`).
- Filenames: Angular Style Guide kebab-case + role suffix (`*.component.ts`, `*.service.ts`).

## Legacy reference (parent monorepo)

Pre-marketsui-platform Angular code to mine when porting:

- `packages/angular/widgets/widgets-angular/`
- `packages/angular/tools/config-browser-angular/`
- `packages/angular/providers/config-service-angular/`
- `packages/angular/providers/data-services-angular/`
- `packages/angular/hosts/host-wrapper-angular/`

See [`docs/PACKAGE_ORGANIZATION.md`](../docs/PACKAGE_ORGANIZATION.md) for the full ten-bucket map.
