# Running the AI assistant against a local LLM

Measured 2026-09-02 on an Apple M4 Max, 36 GB, with Ollama 0.33 and the
assistant's **real** request: system prompt + all 56 tool schemas ≈ 29,200
tokens on every turn (`llmBench.test.ts` reproduces this).

## Setup

```bash
brew install ollama
ollama pull qwen2.5:14b          # 9 GB  — the practical choice on a 36 GB Mac
ollama pull qwen2.5:32b          # 19 GB — no accuracy gain here, 2–3× slower

OLLAMA_FLASH_ATTENTION=1 OLLAMA_ORIGINS="*" ollama serve
```

Then in the assistant's settings strip: base URL `http://127.0.0.1:11434`,
pick the model from the dropdown. The health badge works (falls back to
`/v1/models`); streaming tool calls work unchanged.

**Context:** Qwen2.5's GGUF declares a 32k window and Ollama caps there
regardless of `OLLAMA_CONTEXT_LENGTH`. 32k holds the 29k preamble plus a
short conversation — a long session or a big `get_feature_guide` result
will hit it. Raising it needs a Modelfile (`PARAMETER num_ctx 49152`) and
YaRN, which costs quality; pruning the preamble (below) is the better fix.

**KV cache:** `OLLAMA_KV_CACHE_TYPE=q8_0` saves ~4 GB but did not change
prefill speed materially (74 vs 68 tok/s average for 32b). Leave it at the
f16 default unless memory is the constraint.

## Numbers

| | qwen2.5:14b (Q4) | qwen2.5:32b (Q4) |
|---|---|---|
| tool chosen correctly (10 prompts) | **9/10** | **9/10** |
| cold first turn (29k-token preamble) | **~3 min** (162 tok/s prefill) | **~7.3 min** (68 tok/s) |
| warm turn, same prefix (prefix cache) | 2.1–5.0 s | 4.7–11.3 s |
| generation at 29k context | ~5 tok/s | ~5.7 tok/s |
| memory resident | 12 GB | 28 GB (f16 KV) |

The one "miss" was the same on both: *pivot sector against currency
showing total notional* → `query_grid_data` with a correctly formed
`groupBy/pivotBy/aggregate` (the query-engine pivot) instead of the live-grid
`set_row_grouping`. Defensible either way. 14b also followed the prompt's
"call `list_grid_customizations` before adding a styling rule" instruction
where 32b went straight to `set_column_style`.

Prefill is the whole story: it starts near 480 tok/s (14b) / 170 tok/s
(32b) and decays as the context grows, because attention cost rises with
length. Model size buys nothing on this task set and costs 2–3× on every
turn, so **14b** is the recommendation for a laptop.

## What would actually make it fast

1. **Prune tools per turn.** 18k of the 29k tokens are tool schemas. The
   NLP router in `src/nlpAssistant/` classifies intent locally in <1 ms;
   send only the 5–10 tools relevant to that intent plus the always-useful
   ones (`list_grids`, `get_grid_columns`, `get_feature_guide`). Cold turn
   drops from minutes to ~20 s and a 14b model gets a much easier choice.
2. **Warm the prefix at startup.** Fire one throwaway request with the
   system prompt + tools when the assistant window opens, so the user's
   first real turn hits the prefix cache. Keep anything dynamic (row
   counts, timestamps) *out* of the system prompt or the cache is
   invalidated every turn.
3. **A GPU server for a team.** vLLM on one L40S/A100 runs qwen2.5-32b in
   fp8 with prefix caching across users:
   `--enable-auto-tool-choice --tool-call-parser hermes --enable-prefix-caching`.

## Reproducing

```bash
cd apps/source/star-demo
LLM_BENCH_URL=http://127.0.0.1:11434 LLM_BENCH_MODEL=qwen2.5:14b \
  npx vitest run src/aiAssistant/llmBench.test.ts
cat llm-bench.log
```
