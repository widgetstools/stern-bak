// Probe 3: which sort descriptor makes the engine sort descending?
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = fileURLToPath(new URL('../../../packages/data/host-data/vendor/dshub/', import.meta.url));
const { initSync, RustHub } = await import(pathToFileURL(dir + 'dshub.js').href);
initSync({ module: readFileSync(dir + 'dshub_bg.wasm') });
const hub = RustHub.new();
hub.boot_datasource(JSON.stringify({ id: 'p', schemaRef: 'p@v1', keyColumns: ['id'], columns: [{ name: 'id', type: 'string' }, { name: 'n', type: 'f64' }], searchColumns: [] }));
hub.connect('s');
let ctl = 0;
const control = (msg) => JSON.parse(hub.on_control('s', JSON.stringify({ id: `c${++ctl}`, ...msg })));
control({ type: 'subscribe', ref: { datasourceId: 'p', params: {} }, delivery: 'rows' });
hub.apply_message_json('p', '{}', JSON.stringify([{ id: 'a', n: 30 }, { id: 'b', n: 10 }, { id: 'c', n: 20 }]));
const read = (sort) => {
  const opened = control({ type: 'openView', ref: { datasourceId: 'p', params: {} }, view: { filter: [], sort } });
  const viewId = opened.find((r) => r.payload?.viewId)?.payload?.viewId;
  const err = opened.find((r) => r.error)?.error;
  const win = control({ type: 'readWindow', viewId, startRow: 0, endRow: 10 });
  const res = win.find((r) => r.type === 'result') ?? win[0];
  return { err, rows: (res?.payload?.rows ?? []).map((r) => r.n).join(',') };
};
const variants = {
  "dir:'desc'": [{ column: 'n', dir: 'desc' }],
  "direction:'desc'": [{ column: 'n', direction: 'desc' }],
  "order:'desc'": [{ column: 'n', order: 'desc' }],
  'desc:true': [{ column: 'n', desc: true }],
  'descending:true': [{ column: 'n', descending: true }],
  "dir:'DESC'": [{ column: 'n', dir: 'DESC' }],
  "sort:'desc'": [{ column: 'n', sort: 'desc' }],
  "colId+sort": [{ colId: 'n', sort: 'desc' }],
  "tuple ['n','desc']": [['n', 'desc']],
  "asc baseline dir:'asc'": [{ column: 'n', dir: 'asc' }],
  "ascending:false": [{ column: 'n', ascending: false }],
};
for (const [name, sort] of Object.entries(variants)) console.log(name.padEnd(26), JSON.stringify(read(sort)));
// Also: does the openView reply echo the normalised view? print raw reply for one variant
const raw = control({ type: 'openView', ref: { datasourceId: 'p', params: {} }, view: { filter: [], sort: [{ column: 'n', dir: 'desc' }] } });
console.log('raw openView reply:', JSON.stringify(raw).slice(0, 400));
