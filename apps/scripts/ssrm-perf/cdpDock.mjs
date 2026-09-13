// cdpDock.mjs — shared plumbing for the dock probes (WORKLOG 19–21, refactor
// plan G1). Raw DevTools protocol over a WebSocket (Node ≥ 22 has a global
// WebSocket), no Playwright: a probe attaches to the RUNNING OpenFin dock —
// `--remote-debugging-port=9091` in the star-demo manifest — and touches only
// the pages it is pointed at. Nothing is restarted or reloaded unless a probe
// asks for it (`--reload`), so a docked six-blotter layout keeps its state.
//
// Works against any Chromium with a remote-debugging port (the smoke run uses
// a Playwright-launched one); OpenFin-only probes say so when `fin` is absent.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = process.env.SSRM_PERF_OUT ?? join(HERE, 'out');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Common flags. `--url` is a substring of the page URL or title. */
export function parseArgs(argv, defaults = {}) {
  const args = {
    cdp: process.env.CDP_URL ?? 'http://127.0.0.1:9091',
    url: '', all: false, reload: false, bytes: false,
    seconds: 10, warmup: 3, top: 15, tag: '', help: false,
    ...defaults,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '--cdp': args.cdp = next(); break;
      case '--url': args.url = next(); break;
      case '--all': args.all = true; break;
      case '--reload': args.reload = true; break;
      case '--no-reload': args.reload = false; break;
      case '--bytes': args.bytes = true; break;
      case '--seconds': args.seconds = Number(next()); break;
      case '--warmup': args.warmup = Number(next()); break;
      case '--top': args.top = Number(next()); break;
      case '--tag': args.tag = next(); break;
      case '--help': case '-h': args.help = true; break;
      default: throw new Error(`unknown argument ${a} (try --help)`);
    }
  }
  return args;
}

export const COMMON_FLAGS = [
  '  --cdp <url>      DevTools endpoint (default $CDP_URL or http://127.0.0.1:9091, the dock)',
  '  --url <substr>   page URL/title filter; with several matches, add --all or narrow it',
  '  --all            act on every matching page (probes run in parallel)',
  '  --tag <name>     suffix for the JSON written to out/',
];

export async function listPages(cdp) {
  const res = await fetch(`${cdp.replace(/\/$/, '')}/json/list`);
  if (!res.ok) throw new Error(`${cdp}/json/list → HTTP ${res.status}`);
  const targets = await res.json();
  return targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl
    && !t.url.startsWith('devtools://') && !t.url.startsWith('chrome://'));
}

export function selectPages(pages, args) {
  const hits = args.url
    ? pages.filter((p) => p.url.includes(args.url) || (p.title ?? '').includes(args.url))
    : pages;
  const list = () => pages.map((p) => `    ${pageLabel(p)}`).join('\n');
  if (hits.length === 0) throw new Error(`no page matches --url ${JSON.stringify(args.url)} at ${args.cdp}\n  pages:\n${list()}`);
  if (hits.length > 1 && !args.all) throw new Error(`${hits.length} pages match; add --all or narrow --url\n  matches:\n${hits.map((p) => `    ${pageLabel(p)}`).join('\n')}`);
  return hits;
}

export const pageLabel = (t) => (t.title ? `${t.title} — ` : '') + t.url;

/** One CDP session on one page target. */
export async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`cannot open ${target.webSocketDebuggerUrl} (is another DevTools client attached?)`));
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (!p) return;
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method).delete(fn);
  };
  return { target, send, on, close: () => ws.close() };
}

/** `Runtime.evaluate` returning the value; throws on a page-side exception. */
export async function evaluate(session, expression, { awaitPromise = true } = {}) {
  const r = await session.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(`page threw: ${d.exception?.description ?? d.text}`);
  }
  return r.result?.value;
}

/**
 * Install `source` to run before every new document, reload, wait for load +
 * `warmupMs`. Returns a disposer that removes the init script again.
 */
export async function reloadWith(session, source, { warmupMs = 3000 } = {}) {
  await session.send('Page.enable');
  const { identifier } = await session.send('Page.addScriptToEvaluateOnNewDocument', { source });
  const loaded = new Promise((resolve) => {
    const off = session.on('Page.loadEventFired', () => { off(); resolve(); });
  });
  await session.send('Page.reload', { ignoreCache: false });
  await Promise.race([loaded, sleep(60_000)]);
  await sleep(warmupMs);
  return () => session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
}

export function pct(values, p) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export const round = (v, d = 1) => (v == null ? null : Number(v.toFixed(d)));

export function writeResult(script, tag, data) {
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(OUT, `${script}${tag ? `-${tag}` : ''}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Run `fn` on every selected page in parallel, one session each. */
export async function forEachPage(args, fn) {
  const pages = selectPages(await listPages(args.cdp), args);
  return Promise.all(pages.map(async (target) => {
    const session = await attach(target);
    try { return await fn(session, target); } finally { session.close(); }
  }));
}

export async function run(main) {
  try { await main(); } catch (e) { console.error(`\n✗ ${e.message}`); process.exit(1); }
}
