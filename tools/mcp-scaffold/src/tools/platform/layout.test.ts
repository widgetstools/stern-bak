import { describe, expect, it } from 'vitest';
import { handleConfigOrCode } from './configOrCode.js';
import {
  handleGenerateLayout,
  handleValidateLayout,
  handleImportLayoutPack,
  handleLayoutRecipe,
} from './layout.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

describe('layout MCP tools', () => {
  it('config_or_code recommends layout for renderer features', () => {
    const out = handleConfigOrCode({ feature: 'Add heatmap renderer on notional column', gridId: 'blotter-1' });
    expect(out.approach).toBe('layout');
    expect(out.nextTools).toContain('starui_generate_layout');
    expect(out.terminology?.userFacing).toBe('layout');
  });

  it('config_or_code recommends code for OpenFin routes', () => {
    const out = handleConfigOrCode({ feature: 'Add OpenFin blotter route in manifest', hasOpenFin: true });
    expect(out.approach).toBe('code');
  });

  it('generate_layout builds gc-profile with column-customization', () => {
    const out = handleGenerateLayout({
      gridId: 'demo-blotter',
      layoutName: 'Pills demo',
      columnRenderers: [{ colId: 'side', rendererId: 'pill' }],
      enableSmartEdit: true,
    });
    expect(out.layout.kind).toBe('gc-profile');
    expect(out.layout.profile.gridId).toBe('demo-blotter');
    expect(out.layout.profile.state['column-customization']?.v).toBe(10);
    expect(out.layout.profile.state['smart-edit']).toBeDefined();
    expect(out.fileName).toMatch(/\.layout\.json$/);
  });

  it('validate_layout accepts generated layout', () => {
    const { layout } = handleGenerateLayout({
      gridId: 'g1',
      layoutName: 'Test',
      columnRenderers: [{ colId: 'status', rendererId: 'pill' }],
    });
    const result = handleValidateLayout(layout);
    expect(result.valid).toBe(true);
    expect(result.moduleIds).toContain('column-customization');
  });

  it('validate_layout rejects invalid payload', () => {
    const result = handleValidateLayout({ kind: 'wrong' });
    expect(result.valid).toBe(false);
  });

  it('layout_recipe uses layout terminology', () => {
    const recipe = handleLayoutRecipe({ gridId: 'positions', dataType: 'positions' });
    expect(recipe.configDir).toBe('config/layouts/');
    expect(recipe.generateTool).toBe('starui_generate_layout');
  });

  it('import_layout_pack writes config/layouts from bundled packs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'starui-layout-import-'));
    const result = handleImportLayoutPack({ projectDir: dir, pack: 'starter' });
    expect(result.written?.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'config', 'layouts', '01-pill-side-and-status.layout.json'))).toBe(true);
  });
});
