# star-demo NLP server

LLM-free natural-language parsing for the assistant. One small
sentence-embedding model (MiniLM, ~90 MB, downloads on first run to
`~/.cache/huggingface`) does both jobs: intent by nearest example phrasing
(`INTENT_EXAMPLES` in `main.py` — add a line to teach it a new wording) and
column resolution by similarity to the grid's headers.

Zero-shot NLI (BART-MNLI) was the first cut and scored 1/9 on a labelled set
of trader phrasings — entailment is the wrong question for "put cusip back".

```bash
cd server/nlp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8100 --reload
```

Smoke test:

```bash
curl -s localhost:8100/health
curl -s localhost:8100/parse -H 'content-type: application/json' -d '{
  "text": "group by sector and sum notional, top 10 by market value desc",
  "columns": [{"colId":"issuerSector","headerName":"Sector"},
              {"colId":"notional","headerName":"Notional","numeric":true},
              {"colId":"marketValue","headerName":"Market Value","numeric":true}]
}' | jq
```

Point the app at it with `localStorage.setItem('nlpAssistant.serverUrl', 'http://127.0.0.1:8100')`
or the URL box in the assistant's settings strip. When the server is down the
browser pipeline (`src/nlpAssistant/`) runs alone — same intents, same entity
shape, just keyword/regex instead of a model.

Tuning: `NLP_INTENT_MIN_SIM` (default 0.45) is the similarity below which the
intent is reported as `unknown`; `NLP_EMBED_MODEL` swaps the encoder (any
sentence-transformers model, e.g. `BAAI/bge-small-en-v1.5`).
