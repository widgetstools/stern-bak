#!/usr/bin/env node
/**
 * generate.mjs — emits the finished SVG diagrams for docs/latest.
 *
 * The diagrams are plain, self-contained SVG (system font stacks, baked
 * background) so they render identically on GitHub, in editors and in
 * browsers with no diagram toolchain. Rerun after architectural changes:
 *
 *     node docs/latest/diagrams/generate.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

// ─── Visual system ─────────────────────────────────────────────────
const BG = '#fbfcfc';
const INK = '#1c2622';
const MUTED = '#5d6b64';
const HAIR = '#d5ddd8';
const FONT = `-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;

// Layer accents — one hue family per architectural tier.
const TIER = {
  consumer: { stroke: '#7a5ea6', fill: '#f6f2fb', label: '#5d4485' },
  product:  { stroke: '#0e8f6d', fill: '#eefaf5', label: '#0b6e54' },
  react:    { stroke: '#2c6e8f', fill: '#eef6fa', label: '#1f5670' },
  services: { stroke: '#b07a1e', fill: '#fdf6ea', label: '#8a5f14' },
  runtime:  { stroke: '#4a5d8f', fill: '#f0f3fa', label: '#38476e' },
  found:    { stroke: '#6b7770', fill: '#f3f5f4', label: '#4d5751' },
  neutral:  { stroke: '#8a9992', fill: '#ffffff', label: MUTED },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgDoc(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="${FONT}" role="img" aria-label="${esc(title)}">
<defs>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#8a9992"/>
  </marker>
  <marker id="arrAccent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#0e8f6d"/>
  </marker>
</defs>
<rect width="${w}" height="${h}" fill="${BG}"/>
${body}
</svg>\n`;
}

/** Rounded box with a title line and optional detail lines. */
function box(x, y, w, h, tier, title, lines = [], opts = {}) {
  const t = TIER[tier];
  const titleSize = opts.titleSize ?? 13;
  const lineSize = opts.lineSize ?? 10.5;
  const cx = x + w / 2;
  const contentH = titleSize + lines.length * (lineSize + 4);
  let ty = y + (h - contentH) / 2 + titleSize - 2;
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4"/>\n`;
  out += `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${titleSize}" font-weight="650" fill="${INK}"${opts.mono ? ` font-family="${MONO}"` : ''}>${esc(title)}</text>\n`;
  for (const line of lines) {
    ty += lineSize + 4;
    out += `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="${lineSize}" fill="${MUTED}">${esc(line)}</text>\n`;
  }
  return out;
}

/** Uppercase mono side-label for a band. */
function bandLabel(x, y, text, color = MUTED) {
  return `<text x="${x}" y="${y}" font-size="9.5" font-weight="700" letter-spacing="1.6" fill="${color}" font-family="${MONO}">${esc(text.toUpperCase())}</text>\n`;
}

/** Straight arrow with optional midpoint label. */
function arrow(x1, y1, x2, y2, label = '', opts = {}) {
  const stroke = opts.accent ? '#0e8f6d' : '#8a9992';
  const marker = opts.accent ? 'arrAccent' : 'arr';
  let out = `<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="1.25" marker-end="url(#${marker})"${opts.dash ? ' stroke-dasharray="4 3"' : ''}/>\n`;
  if (label) {
    const mx = (x1 + x2) / 2 + (opts.dx ?? 0);
    const my = (y1 + y2) / 2 + (opts.dy ?? -5);
    out += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="9.5" fill="${MUTED}" font-family="${MONO}">${esc(label)}</text>\n`;
  }
  return out;
}

/** Orthogonal (elbow) arrow: horizontal then vertical, or reverse. */
function elbow(x1, y1, x2, y2, mode = 'hv', label = '', opts = {}) {
  const stroke = opts.accent ? '#0e8f6d' : '#8a9992';
  const marker = opts.accent ? 'arrAccent' : 'arr';
  const d = mode === 'hv'
    ? `M${x1},${y1} L${x2},${y1} L${x2},${y2}`
    : `M${x1},${y1} L${x1},${y2} L${x2},${y2}`;
  let out = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.25" marker-end="url(#${marker})"${opts.dash ? ' stroke-dasharray="4 3"' : ''}/>\n`;
  if (label) {
    const lx = opts.lx ?? (mode === 'hv' ? x2 : x1);
    const ly = opts.ly ?? (y1 + y2) / 2;
    out += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9.5" fill="${MUTED}" font-family="${MONO}">${esc(label)}</text>\n`;
  }
  return out;
}

function caption(x, y, text) {
  return `<text x="${x}" y="${y}" font-size="10.5" fill="${MUTED}" font-style="italic">${esc(text)}</text>\n`;
}

// ─── D1 · Layer model ──────────────────────────────────────────────
function layerModel() {
  const W = 860, ROWH = 88, GAP = 14, X = 150, BW = W - X - 40;
  const rows = [
    { tier: 'consumer', label: 'Consumers', boxes: [
      { t: 'Demo & reference apps', l: ['apps/source/*'] },
      { t: 'External consumer apps', l: ['registry installs'] },
    ]},
    { tier: 'product', label: 'Product', boxes: [
      { t: '@wellsfargo-starui/grid', l: ['MarketsGrid · customizer · config browser · widgets'], mono: true },
    ]},
    { tier: 'react', label: 'React layer', boxes: [
      { t: '@wellsfargo-starui/react', l: ['shadcn/Radix primitives · widget SDK · host wrapper · data bindings'], mono: true },
    ]},
    { tier: 'services', label: 'Services', boxes: [
      { t: '@wellsfargo-starui/data', l: ['SharedWorker data services'], mono: true },
      { t: '@wellsfargo-starui/openfin', l: ['workspace shell · RuntimePort plugin'], mono: true },
    ]},
    { tier: 'runtime', label: 'Core runtime', boxes: [
      { t: '@wellsfargo-starui/core', l: ['grid engine · host ports · widget framework'], mono: true },
    ]},
    { tier: 'found', label: 'Foundation', boxes: [
      { t: '@wellsfargo-starui/design-system', l: ['tokens · themes · icons'], mono: true },
      { t: '@wellsfargo-starui/types', l: ['shared contracts'], mono: true },
    ]},
  ];
  const H = 40 + rows.length * (ROWH + GAP) + 26;
  let b = '';
  let y = 40;
  const rowsMeta = [];
  for (const row of rows) {
    b += bandLabel(28, y + ROWH / 2 + 3, row.label, TIER[row.tier].label);
    const n = row.boxes.length;
    const bw = (BW - (n - 1) * 20) / n;
    row.boxes.forEach((bx, i) => {
      const x = X + i * (bw + 20);
      b += box(x, y, bw, ROWH - 18, row.tier, bx.t, bx.l, { mono: bx.mono, titleSize: 12.5 });
    });
    rowsMeta.push({
      y1: y,
      y2: y + ROWH - 18,
      centers: row.boxes.map((_, i) => X + i * (bw + 20) + bw / 2),
    });
    y += ROWH + GAP - 18 + 18;
  }
  // Connect real boxes, not the band centerline — on two-box rows the
  // centerline falls in the gap between the boxes, leaving arrows that
  // start or end in empty space. Each transition uses the multi-box
  // row's box centers, so every arrow leaves one box edge and lands on
  // another (a full-width single box spans all those centers).
  for (let i = 0; i < rowsMeta.length - 1; i++) {
    const above = rowsMeta[i], below = rowsMeta[i + 1];
    const xs = above.centers.length >= below.centers.length ? above.centers : below.centers;
    for (const x of xs) b += arrow(x, above.y2, x, below.y1 - 1);
  }
  b += `<text x="${W - 40}" y="${H - 16}" text-anchor="end" font-size="10.5" fill="${MUTED}" font-style="italic">imports flow downward only — a package never imports from a layer above it</text>\n`;
  b += bandLabel(28, 24, 'StarUI · layer model', TIER.product.label);
  return svgDoc(W, H, b, 'StarUI layer model');
}

// ─── D2 · Package dependency graph ─────────────────────────────────
function depGraph() {
  const W = 980, H = 380;
  // Drawn as the TRANSITIVE REDUCTION — the dependency structure is a
  // near-chain, so seven arrows tell the whole story where the full
  // 19-edge direct graph reads as spaghetti. The caption states the
  // implied-transitivity rule; per-package direct deps live in
  // packages.md / each package.json.
  const BH = 64, Y = 108, STEP = 158, BW = 130;
  const chain = [
    ['grid',    'product', 'MarketsGrid'],
    ['react',   'react',   'primitives \u00b7 SDK'],
    ['openfin', 'services', 'workspace shell'],
    ['data',    'services', 'data services'],
    ['core',    'runtime',  'engine \u00b7 hosts'],
    ['types',   'found',    'contracts'],
  ];
  let b = '';
  chain.forEach(([name, tier, sub], i) => {
    const x = 30 + i * STEP;
    b += box(x, Y, BW, BH, tier, name, [sub], { mono: true, titleSize: 13 });
    if (i < chain.length - 1) {
      b += arrow(x + BW + 2, Y + BH / 2, x + STEP - 4, Y + BH / 2);
    }
  });
  // design-system branch: openfin needs the tokens; the tokens need only types.
  b += box(475, 252, 190, 56, 'found', 'design-system', ['tokens \u00b7 themes \u00b7 icons'], { mono: true, titleSize: 13 });
  b += `<path d="M411,${Y + BH + 2} L411,280 L473,280" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;
  b += `<path d="M665,280 L885,280 L885,${Y + BH + 4}" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;

  b += bandLabel(28, 24, 'Package dependencies \u00b7 simplified to the essential arrows', TIER.product.label);
  b += caption(28, H - 44, 'An arrow means "depends on" \u2014 and every package also depends on everything reachable further along the');
  b += caption(28, H - 28, 'arrows (grid really does import all six; the extra arrows are omitted because they are implied). types is the');
  b += caption(28, H - 12, 'root: it depends on nothing. Framework libraries (React, AG Grid, OpenFin) are peers owned by the consuming app.');
  return svgDoc(W, H, b, 'StarUI package dependency graph');
}

// ─── D3 · Host / port / widget runtime model ───────────────────────
function runtimeModel() {
  const W = 860, H = 420;
  let b = '';
  b += bandLabel(28, 24, 'Runtime model · hosts, ports, widgets', TIER.product.label);

  // Widget (top center)
  b += box(310, 44, 240, 64, 'product', 'Widget', ['a grid · a panel · any embeddable unit', 'core/widget'], { titleSize: 13 });
  // Ports (middle)
  b += box(310, 168, 240, 58, 'runtime', 'Host ports', ['identity · theme · surface · data', 'core/host'], { mono: false });
  // Config store attached right
  b += box(620, 168, 200, 58, 'runtime', 'Config store', ['Dexie / IndexedDB', 'core/host/config'], {});
  // Adapters (bottom row)
  b += box(120, 296, 260, 62, 'services', 'Browser adapter', ['plain browser tab', 'core/host/browser · core/widget/browser'], {});
  b += box(480, 296, 260, 62, 'services', 'OpenFin RuntimePort plugin', ['workspace · dock · home · notifications', 'openfin/plugin · openfin/host'], {});

  b += arrow(430, 108, 430, 166, 'typed ports', { dx: 46 });
  b += elbow(550, 197, 618, 197, 'hv');
  b += arrow(370, 226, 256, 294);
  b += arrow(490, 226, 604, 294);
  b += caption(28, H - 16, 'The same widget runs unchanged in a browser tab or inside an OpenFin workspace — the adapter provides the same ports.');
  return svgDoc(W, H, b, 'StarUI host, port and widget runtime model');
}

// ─── D4 · Data services ────────────────────────────────────────────
function dataFlow() {
  const W = 900, H = 400;
  let b = '';
  b += bandLabel(28, 24, 'Data services · one connection, every window', TIER.product.label);

  b += box(40, 160, 170, 66, 'neutral', 'Upstream feed', ['STOMP broker'], {});
  // SharedWorker group
  b += `<rect x="270" y="90" width="250" height="212" rx="4" fill="#fdf6ea" stroke="#b07a1e" stroke-width="1.4"/>\n`;
  b += `<text x="395" y="114" text-anchor="middle" font-size="12.5" font-weight="650" fill="${INK}">SharedWorker</text>\n`;
  b += `<text x="395" y="130" text-anchor="middle" font-size="10" fill="${MUTED}" font-family="${MONO}">data-services-worker.mjs</text>\n`;
  b += box(292, 148, 206, 50, 'neutral', 'single upstream session', [], { titleSize: 11.5 });
  b += box(292, 226, 206, 56, 'neutral', 'fan-out hub', ['snapshot + thin delta-patch frames'], { titleSize: 11.5 });
  b += arrow(395, 198, 395, 224);

  b += box(590, 110, 170, 54, 'react', 'runtime client', ['window A'], {});
  b += box(590, 250, 170, 54, 'react', 'runtime client', ['window B'], {});
  b += box(790, 104, 90, 40, 'product', 'grid', [], { mono: true, titleSize: 12 });
  b += box(790, 152, 90, 40, 'product', 'grid', [], { mono: true, titleSize: 12 });
  b += box(790, 258, 90, 40, 'product', 'grid', [], { mono: true, titleSize: 12 });

  b += arrow(210, 193, 268, 193, 'stomp', { dy: -6 });
  // Fan-out — three-segment routes that enter each client's LEFT edge
  // horizontally; a two-segment elbow runs its vertical leg along the
  // boxes' borders with the head sliding on the edge.
  b += `<path d="M520,254 L555,254 L555,137 L588,137" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;
  b += `<path d="M520,254 L555,254 L555,277 L588,277" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;
  b += arrow(760, 124, 788, 124);
  b += `<path d="M760,150 L774,150 L774,172 L788,172" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;
  b += arrow(760, 278, 788, 278);
  b += caption(28, H - 40, 'N grids across M windows share one upstream connection. Post-snapshot frames carry per-row');
  b += caption(28, H - 24, 'field patches (thin deltas), not whole rows — see docs/hub-fanout-optimizations.md for the wire format.');
  return svgDoc(W, H, b, 'StarUI data services flow');
}

// ─── D5 · Build & consumption tracks ───────────────────────────────
function tracks() {
  const W = 900, H = 470;
  let b = '';
  b += bandLabel(28, 24, 'Build & consumption · three tracks, one truth', TIER.product.label);

  b += box(330, 48, 240, 56, 'runtime', 'packages/*/src', ['seven workspaces'], { mono: true });
  b += box(330, 158, 240, 60, 'runtime', 'packages/*/dist', ['+ tsconfig.consumer.json'], { mono: true });
  b += arrow(450, 104, 450, 156, 'turbo build (tsc)', { dx: 78 });

  // Source track (left) — three-segment route: drop out of dist, run left
  // through the clear band between the rows, then turn down into the box
  // top. A two-segment elbow here skims the top borders of dist-npm and
  // apps/source instead of entering cleanly.
  b += box(60, 288, 230, 72, 'product', 'apps/source/*', ['source track', '"did a platform change break the demos?"'], { mono: true, titleSize: 12.5 });
  b += `<path d="M360,220 L360,252 L175,252 L175,286" fill="none" stroke="#8a9992" stroke-width="1.25" marker-end="url(#arr)"/>\n`;
  b += `<text x="258" y="246" text-anchor="middle" font-size="9.5" fill="${MUTED}" font-family="${MONO}">vite aliases + consumer tsconfig</text>\n`;

  // Tarball path (center)
  b += box(345, 288, 210, 56, 'services', 'dist-npm/*.tgz', ['npm run pack:npm — one per package'], { mono: true, titleSize: 12.5 });
  b += arrow(450, 218, 450, 286, 'pack', { dx: 26 });

  b += box(345, 388, 210, 56, 'services', 'apps/vendor + tarball/*', ['tarball track', '"can an external team install this?"'], { titleSize: 11.5 });
  b += arrow(450, 344, 450, 386, 'vendored', { dx: 38 });

  // External (right)
  b += box(630, 288, 220, 56, 'consumer', 'Artifactory / registry', ['published under real names'], {});
  b += elbow(555, 316, 628, 316, 'hv');
  b += box(630, 388, 220, 56, 'consumer', 'External consumer apps', ['plain npm install — no aliases'], {});
  b += arrow(740, 344, 740, 386);

  b += caption(28, H - 14, 'The tarball track keeps external consumption honest: it must build with no aliases and no access to packages/ source.');
  return svgDoc(W, H, b, 'StarUI build and consumption tracks');
}

// ─── D6 · Overview stack (for overview.md) ─────────────────────────
function overviewStack() {
  const W = 700, ROWS = [
    ['consumer', 'apps', 'yours + the bundled demos'],
    ['product', 'grid', 'MarketsGrid product surface'],
    ['react', 'react', 'primitives · widget SDK'],
    ['services', 'data · openfin', 'platform services'],
    ['runtime', 'core', 'engine · host ports · widgets'],
    ['found', 'types · design-system', 'foundation'],
  ];
  const RH = 54, GAP = 16, X = 170, BW = 360;
  const H = 36 + ROWS.length * (RH + GAP);
  let b = '';
  let y = 28;
  ROWS.forEach(([tier, t, sub], i) => {
    b += box(X, y, BW, RH, tier, t, [sub], { mono: true, titleSize: 13 });
    if (i < ROWS.length - 1) b += arrow(X + BW / 2, y + RH, X + BW / 2, y + RH + GAP - 1);
    y += RH + GAP;
  });
  b += `<text x="${X + BW + 24}" y="${H / 2}" font-size="10" fill="${MUTED}" font-family="${MONO}" transform="rotate(90 ${X + BW + 24} ${H / 2})" text-anchor="middle" letter-spacing="1.4">IMPORTS FLOW DOWNWARD</text>\n`;
  return svgDoc(W, H, b, 'StarUI at a glance');
}

// ─── Emit ──────────────────────────────────────────────────────────
const files = {
  'layer-model.svg': layerModel(),
  'dependency-graph.svg': depGraph(),
  'runtime-model.svg': runtimeModel(),
  'data-services.svg': dataFlow(),
  'consumption-tracks.svg': tracks(),
  'overview-stack.svg': overviewStack(),
};
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg);
  console.log(`wrote ${name} (${svg.length} bytes)`);
}
