import { describe, expect, it } from 'vitest';
import { recommendTemplate } from '../../knowledge/platform.js';
import { handleGenerateStompConfig, handleProviderConfigFromCsv } from './provider.js';
import { handleRecommendTemplate, handleDiagnoseDataPlane } from './workflow.js';
import { PLATFORM_TOOLS } from '../registry.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('platform MCP tools', () => {
  it('registers all platform tools including diagnose and STOMP helpers', () => {
    const names = PLATFORM_TOOLS.map((t) => t.name);
    expect(names).toContain('starui_diagnose_data_plane');
    expect(names).toContain('starui_setup_stomp_dev');
    expect(names).toContain('starui_generate_stomp_config');
    expect(names.length).toBeGreaterThanOrEqual(44);
  });

  it('recommend_template picks stomp for live data', () => {
    const rec = handleRecommendTemplate({ needsLiveData: true });
    expect(rec.recommendation.templateId).toBe('stomp');
  });

  it('recommendTemplate picks openfin when requested', () => {
    const rec = recommendTemplate({ needsOpenFin: true });
    expect(rec.templateId).toBe('openfin-platform');
  });

  it('generate_stomp_config produces listenerTopic and ensure snippet', () => {
    const out = handleGenerateStompConfig({ clientTag: 'T1', dataType: 'positions' });
    expect(out.stompConfig.listenerTopic).toBe('/snapshot/positions/T1');
    expect(out.ensureStompProviderSnippet).toContain('ensureStompProvider');
    expect(out.ensureStompProviderSnippet).toContain('DataProviderConfigStore');
  });

  it('provider_config_from_csv infers key column and col defs', () => {
    const out = handleProviderConfigFromCsv({ csvHeaderLine: 'positionId,symbol,quantity' });
    expect(out.inferredKeyColumn).toBe('positionId');
    expect(out.columnDefinitions).toHaveLength(3);
    expect(out.stompConfig.keyColumn).toBe('positionId');
  });

  it('diagnose_data_plane flags missing data plane on minimal project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'starui-mcp-test-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf8');
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {}', 'utf8');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/dataServices.ts'), 'export const dataServices = {}', 'utf8');

    const result = await handleDiagnoseDataPlane({ projectDir: dir });
    expect(result.summary).toBeTruthy();
    expect(result.troubleshooting.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.message.includes('SharedWorker'))).toBe(true);
  });
});
