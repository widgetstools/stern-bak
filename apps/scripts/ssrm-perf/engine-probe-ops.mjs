// Probe 2: does the engine sort strings / numbers? which string ops work?
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = fileURLToPath(new URL('../../../packages/data/host-data/vendor/dshub/', import.meta.url));
const { initSync, RustHub } = await import(pathToFileURL(dir + 'dshub.js').href);
initSync({ module: readFileSync(dir + 'dshub_bg.wasm') });
const hub = RustHub.new();
hub.boot_datasource(JSON.stringify({ id: 'p', schemaRef: 'p@v1', keyColumns: ['id'], columns: [{ name: 'id', type: 'string' }, { name: 's', type: 'string' }, { name: 'n', type: 'f64' }], searchColumns: ['s'] }));
hub.connect('s');
let ctl = 0;
const control = (msg) => JSON.parse(hub.on_control('s', JSON.stringify({ id: `c${++ctl}`, ...msg })));
control({ type: 'subscribe', ref: { datasourceId: 'p', params: {} }, delivery: 'rows' });
// insert deliberately out of order
hub.apply_message_json('p', '{}', JSON.stringify([
  { id: 'r1', s: 'Mango', n: 30 }, { id: 'r2', s: 'apple', n: 10 }, { id: 'r3', s: 'Zebra', n: 20 }, { id: 'r4', s: 'banana', n: 40 },
]));
const read = (filter, sort = []) => {
  const opened = control({ type: 'openView', ref: { datasourceId: 'p', params: {} }, view: { filter, sort } });
  const viewId = opened.find((r) => r.payload?.viewId)?.payload?.viewId;
  const win = control({ type: 'readWindow', viewId, startRow: 0, endRow: 10 });
  const res = win.find((r) => r.type === 'result') ?? win[0];
  return { err: res?.error, rows: (res?.payload?.rows ?? []).map((r) => `${r.id}:${r.s}:${r.n}`) };
};
console.log('no sort           :', JSON.stringify(read([])));
console.log('sort n asc        :', JSON.stringify(read([], [{ column: 'n', dir: 'asc' }])));
console.log('sort n desc       :', JSON.stringify(read([], [{ column: 'n', dir: 'desc' }])));
console.log('sort s asc        :', JSON.stringify(read([], [{ column: 's', dir: 'asc' }])));
console.log('sort s desc       :', JSON.stringify(read([], [{ column: 's', dir: 'desc' }])));
console.log('sort s asc (direction key):', JSON.stringify(read([], [{ column: 's', direction: 'asc' }])));
console.log('contains "an"     :', JSON.stringify(read([{ column: 's', op: 'contains', value: 'an' }])));
console.log('equalsIgnoreCase  :', JSON.stringify(read([{ column: 's', op: 'equalsIgnoreCase', value: 'MANGO' }])));
console.log('startsWith "b"    :', JSON.stringify(read([{ column: 's', op: 'startsWith', value: 'b' }])));
console.log('in [apple,Zebra]  :', JSON.stringify(read([{ column: 's', op: 'in', value: ['apple', 'Zebra'] }])));
console.log('notEqual apple    :', JSON.stringify(read([{ column: 's', op: 'notEqual', value: 'apple' }])));
console.log('or(equals,equals) :', JSON.stringify(read([{ op: 'or', conditions: [{ column: 's', op: 'equals', value: 'apple' }, { column: 's', op: 'equals', value: 'Zebra' }] }])));
console.log('n gte 20 sort n   :', JSON.stringify(read([{ column: 'n', op: 'greaterThanOrEqual', value: 20 }], [{ column: 'n', dir: 'asc' }])));
