// @vitest-environment node
/**
 * Local-LLM benchmark for the assistant's REAL request shape — the full
 * system prompt plus all tool schemas, streamed, exactly as `useChatSession`
 * sends them. Skipped unless `LLM_BENCH_URL` is set, so it never runs in CI.
 *
 *   LLM_BENCH_URL=http://127.0.0.1:11434 LLM_BENCH_MODEL=qwen2.5:14b \
 *     npx vitest run src/aiAssistant/llmBench.test.ts
 *
 * Reports, per prompt: which tool the model called (vs. expected), time to
 * first token, total time, and generated tokens/s. The first prompt is sent
 * twice so the second run shows the effect of the server's prefix cache on
 * the ~29k-token preamble.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';

// Node's fetch abandons a request after 300 s without response headers. A
// cold 29k-token preamble on a 30B-class model takes longer than that on a
// laptop, and that number is exactly what this bench exists to measure.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));
import { streamChat, type ChatMessage } from './llmClient';
import { TOOL_SCHEMAS } from './tools';
import { buildSystemPrompt } from './systemPrompt';

const URL = process.env.LLM_BENCH_URL;
const MODEL = process.env.LLM_BENCH_MODEL ?? 'auto';
const API_KEY = process.env.LLM_BENCH_KEY;

interface Case {
  prompt: string;
  /** Any of these counts as correct — some requests have two reasonable tools. */
  expect: string[];
}

const CASES: Case[] = [
  { prompt: 'hide the cusip column', expect: ['set_column_visibility', 'set_column_layout'] },
  { prompt: 'group by sector and sum notional', expect: ['set_row_grouping'] },
  { prompt: 'sort by market value descending', expect: ['set_sort'] },
  { prompt: 'show only Financials', expect: ['set_filter_model', 'set_quick_filter'] },
  { prompt: 'top 10 positions by market value', expect: ['query_grid_data'] },
  { prompt: 'pivot sector against currency showing total notional', expect: ['set_row_grouping'] },
  { prompt: 'what columns does this blotter have?', expect: ['get_grid_columns'] },
  { prompt: 'open a pie chart of notional by sector in a separate window', expect: ['open_analysis_window', 'create_live_report'] },
  { prompt: 'colour negative pnl red', expect: ['add_conditional_styling_rule', 'set_column_style'] },
  { prompt: 'add a column that is notional times price divided by 100', expect: ['add_calculated_column'] },
];

const scope = { gridId: 'grid-test', displayName: 'Test Blotter' };
const system = buildSystemPrompt(scope);
const approxTokens = (s: string) => Math.round(s.length / 4);

async function runOne(prompt: string) {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];
  const t0 = performance.now();
  let tFirst = 0;
  let streamed = '';
  const result = await streamChat({
    baseUrl: URL!,
    apiKey: API_KEY,
    model: MODEL,
    messages,
    tools: TOOL_SCHEMAS,
    onDelta: (d) => {
      if (!tFirst) tFirst = performance.now();
      streamed += d;
    },
  });
  const t1 = performance.now();
  const calls = (result.tool_calls ?? []).map((c) => ({ name: c.function.name, args: c.function.arguments }));
  if (!tFirst) tFirst = t1; // tool-call-only replies stream no content deltas
  const outChars = streamed.length + calls.reduce((n, c) => n + c.name.length + c.args.length, 0);
  return { calls, content: result.content ?? '', ttftMs: Math.round(tFirst - t0), totalMs: Math.round(t1 - t0), outTokens: Math.round(outChars / 4) };
}

describe.skipIf(!URL)(`LLM bench · ${MODEL} @ ${URL}`, () => {
  it(
    'calls the right tool for each request, with timings',
    async () => {
      const preamble = approxTokens(system) + approxTokens(JSON.stringify(TOOL_SCHEMAS));
      const lines: string[] = [`model=${MODEL} preamble≈${preamble} tokens (${TOOL_SCHEMAS.length} tools)`];
      let correct = 0;

      // Cold then warm: identical prefix, so the second run measures prefix caching.
      const cold = await runOne(CASES[0].prompt);
      const warm = await runOne(CASES[0].prompt);
      lines.push(`preamble processing: first call ${cold.totalMs}ms → same prefix again ${warm.totalMs}ms (prefix cache)`);

      for (const c of CASES) {
        const r = await runOne(c.prompt);
        const got = r.calls.map((x) => x.name);
        const ok = got.some((g) => c.expect.includes(g));
        correct += ok ? 1 : 0;
        // A tool-call-only reply arrives as one final chunk on most servers,
        // so there is no first-token moment to time — report the whole
        // response time and skip tok/s, which would be meaningless.
        const streamedText = r.ttftMs < r.totalMs;
        const genMs = Math.max(1, r.totalMs - r.ttftMs);
        const timing = streamedText
          ? `ttft ${String(r.ttftMs).padStart(5)}ms total ${String(r.totalMs).padStart(5)}ms ~${Math.round((r.outTokens / genMs) * 1000)} tok/s`
          : `resp ${String(r.totalMs).padStart(5)}ms (${r.outTokens} tok of tool args)`;
        lines.push(
          `${ok ? '✓' : '✗'} ${c.prompt.padEnd(58)} → ${(got.join(',') || `(text: ${r.content.slice(0, 40)}…)`).padEnd(28)} ${timing}` +
            (ok ? '' : `  args=${r.calls.map((x) => x.args).join(' ')}`),
        );
      }
      lines.push(`score ${correct}/${CASES.length}`);
      // vitest's reporter may swallow console output, so the report also goes
      // to a file (LLM_BENCH_OUT, default ./llm-bench.log) — appended, so
      // successive models can be compared side by side.
      const report = `\n[${new Date().toISOString()}]\n${lines.join('\n')}\n`;
      appendFileSync(process.env.LLM_BENCH_OUT ?? 'llm-bench.log', report);
      // eslint-disable-next-line no-console
      console.log(report);
      expect(correct).toBeGreaterThan(0);
    },
    20 * 60 * 1000,
  );
});
