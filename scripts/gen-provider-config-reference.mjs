/**
 * gen-provider-config-reference.mjs — regenerate docs/latest/provider-config.md
 * FROM THE TYPES.
 *
 * Field tables (name, type, required/optional, doc comment) are extracted
 * with the TypeScript compiler API from
 * `packages/types/shared-types/src/dataProvider.ts`, so the reference can
 * never drift from the source of truth. The prose around the tables lives
 * in this script. `STOMP_TUNING_DEFAULTS` values are read from the same
 * file's initializer.
 *
 * Run:  node scripts/gen-provider-config-reference.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(REPO, 'package.json'));
const ts = require('typescript');

const SRC = path.join(REPO, 'packages/types/shared-types/src/dataProvider.ts');
const OUT = path.join(REPO, 'docs/latest/provider-config.md');

const program = ts.createProgram([SRC], { skipLibCheck: true });
const sf = program.getSourceFile(SRC);

// ─── extraction ─────────────────────────────────────────────────────
const interfaces = new Map(); // name -> { doc, heritage, fields: [{name, type, optional, doc}] }
const constObjects = new Map(); // name -> [{key, value, doc}]

function jsdocOf(node) {
  // Leading-trivia extraction: getFullText() includes the comments that
  // precede the node; take the LAST /** ... */ block (the one attached
  // to this member, not an earlier section banner).
  const full = node.getFullText(sf);
  const bodyStart = node.getStart(sf) - node.getFullStart();
  const trivia = full.slice(0, bodyStart);
  const blocks = [...trivia.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
  if (!blocks.length) return '';
  return blocks[blocks.length - 1][1]
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, ''))
    .join('\n')
    .trim();
}

for (const stmt of sf.statements) {
  if (ts.isInterfaceDeclaration(stmt)) {
    const fields = [];
    for (const m of stmt.members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      fields.push({
        name: m.name.getText(sf),
        type: m.type ? m.type.getText(sf).replace(/\s+/g, ' ') : 'unknown',
        optional: Boolean(m.questionToken),
        doc: jsdocOf(m),
      });
    }
    const heritage = (stmt.heritageClauses ?? [])
      .flatMap((h) => h.types.map((t) => t.getText(sf)))
      .join(', ');
    interfaces.set(stmt.name.text, { doc: jsdocOf(stmt), heritage, fields });
  }
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      const name = decl.name.getText(sf);
      let init = decl.initializer;
      if (init && ts.isAsExpression(init)) init = init.expression;
      if (init && ts.isObjectLiteralExpression(init)) {
        const entries = [];
        for (const propAssign of init.properties) {
          if (!ts.isPropertyAssignment(propAssign)) continue;
          entries.push({
            key: propAssign.name.getText(sf),
            value: propAssign.initializer.getText(sf).replace(/\s+/g, ' '),
            doc: jsdocOf(propAssign),
          });
        }
        constObjects.set(name, entries);
      }
    }
  }
}

// ─── honesty annotations (kept here, not in the types) ──────────────
// Fields declared on a config type that no transport currently reads.
const UNCONSUMED = {
  RestProviderConfig: {
    pollInterval: 'declared but not read by the REST transport today (only `validateProviderConfig` warns on it)',
    paginationMode: 'declared but not consumed by any runtime code today',
    pageSize: 'declared but not consumed by any runtime code today',
    timeout: 'declared but not read by the REST transport today',
  },
};

const esc = (s) => s.replace(/\|/g, '\\|');
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ').trim();

function fieldTable(name) {
  const iface = interfaces.get(name);
  if (!iface) throw new Error(`interface ${name} not found`);
  let md = '';
  if (iface.heritage) md += `*Extends \`${iface.heritage}\` — every base field applies too.*\n\n`;
  md += '| Field | Type | | Notes |\n|---|---|---|---|\n';
  for (const f of iface.fields) {
    const req = f.optional ? 'optional' : '**required**';
    let doc = oneLine(f.doc);
    const note = UNCONSUMED[name]?.[f.name.replace(/[?']/g, '')];
    if (note) doc = (doc ? doc + ' ' : '') + `⚠ ${note}.`;
    md += `| \`${f.name}\` | \`${esc(f.type)}\` | ${req} | ${esc(doc)} |\n`;
  }
  return md;
}

function interfaceDoc(name) {
  const d = interfaces.get(name)?.doc ?? '';
  return d ? oneLine(d) + '\n\n' : '';
}

function tuningTable() {
  const entries = constObjects.get('STOMP_TUNING_DEFAULTS');
  if (!entries) throw new Error('STOMP_TUNING_DEFAULTS not found');
  let md = '| Knob | Effective default | What it is |\n|---|---|---|\n';
  for (const e of entries) {
    md += `| \`${e.key}\` | \`${esc(e.value.replace(/ as const$/, ''))}\` | ${esc(oneLine(e.doc))} |\n`;
  }
  return md;
}

// ─── page ───────────────────────────────────────────────────────────
const page = `# Provider Config Reference

> **Generated from the types** — field tables are extracted from
> [\`packages/types/shared-types/src/dataProvider.ts\`](../../packages/types/shared-types/src/dataProvider.ts)
> by \`scripts/gen-provider-config-reference.mjs\`. Edit the type doc
> comments (or this script's prose), then re-run
> \`node scripts/gen-provider-config-reference.mjs\`.

A **data provider** is a persisted catalog row that tells the SharedWorker
data hub how to reach a data source. The row wrapper is
\`DataProviderConfig\`; its \`config\` field is a \`TransportConfig\` — a
**discriminated union over \`providerType\`** with six variants. There is no
base transport interface; each variant is complete on its own (the two SSRM
variants extend their streaming siblings).

Ways a row gets created:

- \`createStarui({ providers })\` — create-if-missing seeding (deterministic
  \`providerId\` required; later editor edits survive reloads).
- The **Data Provider Editor** (\`npm run app -- dataprovider-editor\`, or the
  in-grid dialog) — validates on save with \`validateProviderConfig\`.
- A **deploy seed** (\`seed.json\`) — see [Seed formats](#seed-formats).

## Provider types

| \`providerType\` | Row model | What it is |
|---|---|---|
| \`stomp\` | CSRM | STOMP-over-WebSocket streaming: snapshot then live deltas, whole dataset to the client |
| \`stomp-ssrm\` | SSRM | same wire, plus the SharedWorker attaches a server-side-row-model query plane — grids page blocks |
| \`rest\` | CSRM | one-shot HTTP fetch — no live updates |
| \`mock\` | CSRM | synthetic rows with optional periodic updates (labs / offline) |
| \`mock-ssrm\` | SSRM | synthetic rows behind the SSRM query plane |
| \`appdata\` | — | not a stream: a key/value bag other configs reference via \`{{name.key}}\` — see [appdata.md](./appdata.md) |

**The CSRM-vs-SSRM discriminator is \`isSsrmProviderType(type)\`**
(\`stomp-ssrm\` or \`mock-ssrm\`). Every mode decision routes through that one
predicate — never test the string suffix inline.

---

## \`DataProviderConfig\` — the catalog row wrapper

${interfaceDoc('DataProviderConfig')}${fieldTable('DataProviderConfig')}

Storage mapping (\`DataProviderConfigStore\`): \`configId = providerId\`,
\`componentType: 'data-provider'\`, \`componentSubType = providerType\`,
\`displayText = name\`, \`payload = config\` + \`__providerMeta\`. Provider rows
are **platform-global**: every user sees the catalog; \`public: true\` rows
are owned by \`'system'\`.

---

## \`StompProviderConfig\` (\`providerType: 'stomp'\`)

${interfaceDoc('StompProviderConfig')}${fieldTable('StompProviderConfig')}

### Effective runtime defaults — \`STOMP_TUNING_DEFAULTS\`

The values the worker applies when a tuning field is unset — single-sourced
so the transport, the hub, and the editor's placeholder text can never
disagree:

${tuningTable()}
Boolean knobs resolve in the transport as \`cfg.conflateEnabled !== false\` /
\`cfg.throttleEnabled !== false\` — both default **ON**; only an explicit
\`false\` disables.

---

## \`StompSsrmProviderConfig\` (\`providerType: 'stomp-ssrm'\`)

${interfaceDoc('StompSsrmProviderConfig')}${fieldTable('StompSsrmProviderConfig')}

---

## \`RestProviderConfig\` (\`providerType: 'rest'\`)

${interfaceDoc('RestProviderConfig')}${fieldTable('RestProviderConfig')}

---

## \`MockProviderConfig\` (\`providerType: 'mock'\`)

${interfaceDoc('MockProviderConfig')}${fieldTable('MockProviderConfig')}

Update-interval resolution in the transport:
\`updateIntervalMs ?? updateInterval ?? per-dataType default\`.

---

## \`MockSsrmProviderConfig\` (\`providerType: 'mock-ssrm'\`)

${interfaceDoc('MockSsrmProviderConfig')}${fieldTable('MockSsrmProviderConfig')}

---

## \`AppDataProviderConfig\` (\`providerType: 'appdata'\`)

${interfaceDoc('AppDataProviderConfig')}${fieldTable('AppDataProviderConfig')}

### \`AppDataVariable\`

${fieldTable('AppDataVariable')}

The AppData layer (mirror, hooks, \`{{name.key}}\` template resolution) has
its own page: [appdata.md](./appdata.md).

---

## \`ColumnDefinition\` — persisted column schema

${interfaceDoc('ColumnDefinition')}${fieldTable('ColumnDefinition')}

\`ColumnDefinition\` is a deliberately narrow, serializable subset of AG
Grid's \`ColDef\` — the full per-column customization state (styles,
formatters, templates) lives in the grid customizer's profile state, not on
the provider.

---

## Validation — \`validateProviderConfig\`

Wired into the provider editor's **save** and **JSON-import** paths. Hard
errors mirror what the transports actually require at attach time:

| Applies to | Condition | Severity | Message |
|---|---|---|---|
| all | \`providerType\` missing | error | Provider type is required |
| \`stomp\`, \`stomp-ssrm\` | \`websocketUrl\` missing/blank | error | WebSocket URL is required for STOMP providers |
| \`stomp\`, \`stomp-ssrm\` | URL present but not \`ws://\`/\`wss://\` | warn | WebSocket URL should typically start with ws:// or wss:// |
| \`stomp\`, \`stomp-ssrm\` | \`listenerTopic\` missing/blank | error | Listener topic is required for STOMP providers |
| \`rest\` | \`baseUrl\` missing/blank | error | Base URL is required for REST providers |
| \`rest\` | URL present but not \`http://\`/\`https://\` | warn | Base URL should typically start with http:// or https:// |
| \`rest\` | \`endpoint\` missing/blank | error | Endpoint is required for REST providers |
| \`rest\` | \`pollInterval\` < 1000 | warn | Poll interval is very low (< 1 second), may cause high server load |
| \`mock\`, \`mock-ssrm\`, \`appdata\` | — | *(no per-type rules)* | |

Returns \`{ isValid, errors, warnings? }\` — \`warnings\` is \`undefined\` (not
\`[]\`) when clean.

---

## Seed formats

Two JSON envelopes exist and are **deliberately incompatible**:

- **Provider export** (\`kind: 'starui.dataProvider'\`, version 1) — the
  editor's per-provider Export/Import round-trip. Strips \`providerId\`,
  \`userId\`, \`isDefault\`; import mints a fresh row.
- **Deploy seed** (\`seed.json\`) — a Config Browser "Export ALL" bundle
  (\`SeedData\`: \`activeAppId\`, \`activeUserId\`, \`appRegistry\`,
  \`userProfiles\`, \`roles\`, \`permissions\`, \`appConfig?\`). Applied only
  against an empty database (\`ConfigManager.seedIfEmpty\`).
  \`parseSeedJson\` **rejects** a provider export dropped in as \`seed.json\`
  with a pointed error.

---

*Editor seed values (\`DEFAULT_PROVIDER_CONFIGS\`) differ from the runtime
defaults above — they are the editor's starting form values, not what the
worker applies to an unset field.*
`;

fs.writeFileSync(OUT, page);
console.log(`wrote ${path.relative(REPO, OUT)} (${page.length} bytes)`);
