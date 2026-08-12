import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE_DIR = join(__dirname);
const FORBIDDEN = ['../worker/', '../client/', '../providers/', '../bootstrap/'];

describe('ssrm engine boundary', () => {
  it('imports nothing from worker, client, providers, or bootstrap', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ENGINE_DIR)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
      for (const bad of FORBIDDEN) {
        if (src.includes(`from "${bad}`) || src.includes(`from '${bad}`)) {
          offenders.push(`${f} -> ${bad}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
