"""
Server-side NLP for the star-demo assistant — no LLM.

Two models, both open weights, both run locally on the server:

  * intent   — zero-shot classification with an NLI model (BART-MNLI by default).
               The candidate labels are the assistant's intents phrased as
               sentences, so no fine-tuning data is needed to get started.
  * columns  — sentence-embedding similarity between the user's phrases and the
               grid's column headers, so "mkt val" resolves to "Market Value".

Everything else (operators, aggregate words, numbers like "1.5m") is the same
deterministic parsing the browser does, so the two pipelines agree on shape and
the client can swap between them freely.

Run:  uvicorn main:app --port 8100 --reload
"""
from __future__ import annotations

import os
import re
import time
from functools import lru_cache
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

INTENT_MODEL = os.environ.get("NLP_INTENT_MODEL", "facebook/bart-large-mnli")
EMBED_MODEL = os.environ.get("NLP_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

Intent = Literal[
    "group_grid", "pivot_grid", "filter_data", "sort_data", "hide_columns", "show_columns",
    "query_data", "create_chart", "format_column", "aggregate_data", "clear_grouping", "unknown",
]

# Natural-language hypotheses for zero-shot NLI. Phrasing them as what the
# user wants (not as labels) is what makes zero-shot work well.
INTENT_HYPOTHESES: dict[str, str] = {
    "group_grid": "The user wants to group the rows by a column.",
    "pivot_grid": "The user wants to pivot the table.",
    "filter_data": "The user wants to filter rows by a condition.",
    "sort_data": "The user wants to sort or order the rows.",
    "hide_columns": "The user wants to hide or remove columns.",
    "show_columns": "The user wants to show or reveal columns.",
    "query_data": "The user is asking a question about the data.",
    "create_chart": "The user wants a chart or graph.",
    "format_column": "The user wants to change how a column is formatted.",
    "aggregate_data": "The user wants a sum, average, count or total.",
    "clear_grouping": "The user wants to remove grouping and see flat rows.",
}

AGG_WORDS = {
    "sum": "sum", "total": "sum", "totals": "sum",
    "average": "avg", "avg": "avg", "mean": "avg",
    "min": "min", "minimum": "min", "lowest": "min",
    "max": "max", "maximum": "max", "highest": "max",
    "count": "count", "how many": "count",
}
CHART_WORDS = {"bar": "bar", "column": "bar", "line": "line", "trend": "line", "pie": "pie",
               "donut": "pie", "scatter": "scatter", "area": "area"}
OP_WORDS: list[tuple[str, str]] = [
    (r"greater than|more than|above|over|>", "gt"),
    (r"at least|>=|no less than", "gte"),
    (r"less than|below|under|<", "lt"),
    (r"at most|<=|no more than", "lte"),
    (r"not equal|isn't|is not|!=|<>", "ne"),
    (r"contains?|containing|like|includes?", "contains"),
    (r"equals?|is|=|==", "eq"),
]
STOP = set("""the a an by on of and or to in for with then me my show group pivot sort filter hide display
chart graph plot grid blotter table rows row columns column data value values asc ascending desc descending
where only all please can you sum total average avg count min max mean top bottom""".split())


class Column(BaseModel):
    colId: str
    headerName: str
    numeric: bool = False


class ParseRequest(BaseModel):
    text: str
    columns: list[Column] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)


class FilterClause(BaseModel):
    column: str
    op: str
    value: str | float | list[str]


class Entities(BaseModel):
    columns: list[str] = Field(default_factory=list)
    unresolved: list[str] = Field(default_factory=list)
    aggregations: dict[str, str] = Field(default_factory=dict)
    sortDirection: str | None = None
    filters: list[FilterClause] = Field(default_factory=list)
    chartKind: str | None = None
    limit: int | None = None


class ParseResponse(BaseModel):
    intent: Intent
    confidence: float
    entities: Entities
    model: str
    latencyMs: int


@lru_cache(maxsize=1)
def intent_pipeline():
    from transformers import pipeline
    return pipeline("zero-shot-classification", model=INTENT_MODEL)


@lru_cache(maxsize=1)
def embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL)


def classify(text: str) -> tuple[Intent, float]:
    labels = list(INTENT_HYPOTHESES.keys())
    out = intent_pipeline()(
        text,
        candidate_labels=labels,
        hypothesis_template="{}",
        multi_label=False,
    )
    # The pipeline returns labels sorted by score; we passed keys, so map back.
    best_label, best_score = out["labels"][0], float(out["scores"][0])
    # hypothesis_template="{}" means the label text IS the hypothesis; we want
    # the friendlier sentences, so re-run with them if the first pass is weak.
    if best_score < 0.5:
        out = intent_pipeline()(text, candidate_labels=list(INTENT_HYPOTHESES.values()), multi_label=False)
        inv = {v: k for k, v in INTENT_HYPOTHESES.items()}
        best_label, best_score = inv[out["labels"][0]], float(out["scores"][0])
    return (best_label if best_score >= 0.35 else "unknown"), best_score  # type: ignore[return-value]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_column(phrase: str, columns: list[Column]) -> str | None:
    """Exact/prefix/substring first (cheap, precise), then embedding similarity."""
    p = _norm(phrase)
    if not p or not columns:
        return None
    for c in columns:
        if p in (_norm(c.colId), _norm(c.headerName)):
            return c.colId
    for c in columns:
        if _norm(c.colId).startswith(p) or _norm(c.headerName).startswith(p):
            return c.colId
    for c in columns:
        if p in _norm(c.colId) or p in _norm(c.headerName):
            return c.colId
    # Semantic fallback: "mkt val" ~ "Market Value"
    try:
        from rapidfuzz import fuzz
        scored = sorted(((fuzz.token_set_ratio(phrase, c.headerName), c) for c in columns), key=lambda t: -t[0])
        if scored and scored[0][0] >= 80:
            return scored[0][1].colId
        model = embedder()
        vecs = model.encode([phrase] + [c.headerName for c in columns], normalize_embeddings=True)
        sims = vecs[1:] @ vecs[0]
        i = int(sims.argmax())
        if float(sims[i]) >= 0.55:
            return columns[i].colId
    except Exception:
        pass
    return None


def candidate_phrases(text: str) -> list[str]:
    out = [m.group(1) for m in re.finditer(r"[\"'“”‘’]([^\"'“”‘’]+)[\"'“”‘’]", text)]
    words = [w for w in re.sub(r"[\"'“”‘’,;:()]", " ", text).split() if w]
    for i in range(len(words)):
        for n in (3, 2, 1):
            run = words[i:i + n]
            if len(run) < n or any(w.lower() in STOP for w in run):
                continue
            out.append(" ".join(run))
    return sorted(set(out), key=lambda s: -len(s))


def parse_value(raw: str) -> str | float:
    m = re.match(r"^(-?\d+(?:\.\d+)?)\s*(k|m|mm|b|bn)?$", raw.replace(",", ""), re.I)
    if not m:
        return raw
    n = float(m.group(1))
    mult = {"k": 1e3, "m": 1e6, "mm": 1e6, "b": 1e9, "bn": 1e9}.get((m.group(2) or "").lower(), 1)
    return n * mult


def extract(text: str, columns: list[Column]) -> Entities:
    lower = text.lower()
    ents = Entities()
    seen: set[str] = set()
    claimed: list[str] = []
    for phrase in candidate_phrases(text):
        key = phrase.lower()
        if any(key in c for c in claimed):
            continue
        col = resolve_column(phrase, columns)
        if col:
            if col not in seen:
                ents.columns.append(col)
                seen.add(col)
            claimed.append(key)

    for word, fn in AGG_WORDS.items():
        m = re.search(rf"\b{word}\b(?:\s+(?:of|the))?\s+([a-zA-Z][a-zA-Z0-9 ]{{0,40}}?)(?=\s*[,;]|\s+(?:by|and|then|where|for)\b|$)", text, re.I)
        if m:
            col = resolve_column(m.group(1).strip(), columns)
            if col:
                ents.aggregations[col] = fn

    if re.search(r"\b(desc|descending|highest first|largest first|top)\b", lower):
        ents.sortDirection = "desc"
    elif re.search(r"\b(asc|ascending|lowest first|smallest first|bottom)\b", lower):
        ents.sortDirection = "asc"

    filt = re.compile(
        r"\b(?:where|with|for|having|only|and|or)\s+([a-zA-Z][a-zA-Z0-9 ]{0,40}?)\s+"
        r"(is not|isn't|is|equals?|=|==|!=|<>|contains?|containing|like|includes?|greater than|more than|above|over|"
        r"at least|less than|below|under|at most|>=|<=|>|<)\s+([^,;]+?)(?=\s+(?:and|or|then|sorted|sort|group|order)\b|$)",
        re.I,
    )
    for m in filt.finditer(text):
        col = resolve_column(m.group(1).strip(), columns)
        if not col:
            ents.unresolved.append(m.group(1).strip())
            continue
        op = next((o for pat, o in OP_WORDS if re.search(pat, m.group(2), re.I)), "eq")
        ents.filters.append(FilterClause(column=col, op=op, value=parse_value(m.group(3).strip().strip("\"'“”‘’"))))

    for word, kind in CHART_WORDS.items():
        if re.search(rf"\b{word}\b", lower):
            ents.chartKind = kind
            break
    if not ents.chartKind and re.search(r"\b(chart|graph|plot|visuali[sz]e)\b", lower):
        ents.chartKind = "auto"

    lim = re.search(r"\b(?:top|first|bottom|last)\s+(\d{1,4})\b", lower)
    if lim:
        ents.limit = int(lim.group(1))
    return ents


app = FastAPI(title="star-demo NLP", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    return {"ok": True, "intentModel": INTENT_MODEL, "embedModel": EMBED_MODEL}


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest) -> ParseResponse:
    t0 = time.perf_counter()
    # Light coreference: "now sort that by yield" → carry the last turn's text in.
    text = req.text
    if req.history and re.search(r"\b(that|it|them|those|same)\b", text, re.I):
        text = f"{req.history[-1]}. {text}"
    intent, conf = classify(req.text)
    ents = extract(text, req.columns)
    return ParseResponse(
        intent=intent, confidence=round(conf, 3), entities=ents,
        model=INTENT_MODEL, latencyMs=int((time.perf_counter() - t0) * 1000),
    )
