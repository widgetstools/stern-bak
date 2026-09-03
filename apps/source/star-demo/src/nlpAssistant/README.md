# nlpAssistant — the LLM-free assistant

Same tools, same analysis panel, no model call. Route: `#/nlp-assistant`
(same `?grid=&instance=&name=&scope=locked` params as `#/ai-assistant`).

```
text ─► intentClassifier ─► entityExtractor ─► toolRouter ─► dispatchTool ─► responseGenerator
              │                    │
              └──(unsure)──► nlpClient ──► server/nlp (FastAPI, zero-shot + embeddings)
```

| file | does |
|---|---|
| `intentClassifier.ts` | ordered, word-bounded regex rules → one of 11 intents + confidence |
| `entityExtractor.ts` | columns (fuzzy vs the grid's catalogue), aggregates, sort, filters, chart kind, limit |
| `toolRouter.ts` | (intent, entities) → ONE existing tool call with the schema's arg shape |
| `responseGenerator.ts` | templated reply; prefers the tool's own summary |
| `nlpClient.ts` | optional server round-trip; identical response shape |
| `useNlpAssistant.ts` | the turn loop; local first, server when unsure |
| `NlpAssistantPanel.tsx` | chat UI; every reply carries `intent · confidence · source · tool` |

What it cannot do that the LLM assistant can: multi-step plans, free-form
questions about *why*, novel phrasings outside the rule set, and reading
attachments. Everything else — group, pivot, sort, filter, hide/show, query,
chart, format — goes through the same `dispatchTool`, so a fix there fixes both.
