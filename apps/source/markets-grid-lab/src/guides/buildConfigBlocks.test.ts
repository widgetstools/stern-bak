import { describe, expect, it } from 'vitest';
import { buildConfigBlocks } from './buildConfigBlocks';
import type { LabFeatureConfig } from '../tabs/labFeatureConfigs';

const fakeConfig = {
  tabId: 'demo',
  providerId: 'p',
  title: 'Demo',
  subtitle: 's',
  help: '',
  gridId: 'lab-demo',
  componentName: 'Demo',
  profiles: [],
  activeProfileId: 'a',
  getColumnDefs: () => [
    { field: 'cusip', headerName: 'CUSIP', valueFormatter: () => 'x' },
    { field: 'midPrice', headerName: 'Mid' },
  ],
  grid: { showFormattingToolbar: true, showProfileSelector: true },
} as unknown as LabFeatureConfig;

describe('buildConfigBlocks', () => {
  it('emits a mount-props block from gridId + chrome', () => {
    const blocks = buildConfigBlocks(fakeConfig);
    const mount = blocks.find((b) => b.label.includes('Mount'));
    expect(mount).toBeDefined();
    expect(mount!.code).toContain('"gridId": "lab-demo"');
    expect(mount!.code).toContain('"showFormattingToolbar": true');
  });

  it('emits a columns block with field + headerName only (no functions inlined)', () => {
    const blocks = buildConfigBlocks(fakeConfig);
    const cols = blocks.find((b) => b.label.includes('Columns'));
    expect(cols).toBeDefined();
    expect(cols!.code).toContain('"field": "cusip"');
    expect(cols!.code).toContain('"headerName": "Mid"');
    expect(cols!.code).not.toContain('valueFormatter');
  });

  it('appends guide.extraConfig blocks after derived ones', () => {
    const blocks = buildConfigBlocks(fakeConfig, {
      id: 'demo', category: 'editing', summary: '', whatWhy: '', trySteps: [], props: [],
      extraConfig: [{ label: 'Rules', lang: 'json', code: '[]' }],
    });
    expect(blocks[blocks.length - 1].label).toBe('Rules');
  });
});
