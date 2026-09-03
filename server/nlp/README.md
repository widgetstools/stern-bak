# star-demo NLP server

LLM-free natural-language parsing for the assistant. Zero-shot intent
classification (BART-MNLI) plus embedding-based column resolution (MiniLM).
Both models download on first run (~1.7 GB total) and are cached by
Hugging Face under `~/.cache/huggingface`.

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

Smaller/faster intent model: `NLP_INTENT_MODEL=MoritzLaurer/deberta-v3-base-zeroshot-v2.0`.
