"""
Server-side NLP for the star-demo assistant — no LLM.

One small open-weights sentence-embedding model (MiniLM, ~90 MB), run locally:

  * intent   — nearest-example matching: every intent has a bank of example
               phrasings below; the user's sentence is embedded once and scored
               by cosine similarity against them. Zero-shot NLI was tried first
               and scored 1/9 on command-like sentences — entailment is the
               wrong question for "put cusip back". Adding a phrasing the model
               misses is one line in INTENT_EXAMPLES, no retraining.
  * columns  — the same embeddings between the user's phrases and the grid's
               column headers, so "mkt val" resolves to "Market Value".

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
from typing import Literal, Optional, Union

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

EMBED_MODEL = os.environ.get("NLP_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
# Below this cosine similarity to the nearest example the intent is "unknown".
INTENT_MIN_SIM = float(os.environ.get("NLP_INTENT_MIN_SIM", "0.4"))
# Pairs the tool router treats identically — a close call between them is
# not ambiguity, so the margin check ignores it.
SIBLINGS = {frozenset({"query_data", "aggregate_data"})}
# Sentence embeddings are weak at antonyms: "lose cusip" and "put cusip back"
# share their object and land near each other. When hide/show are the top two,
# the verb decides.
HIDE_VERBS = re.compile(r"\b(hide|remove|lose|drop|kill|ditch|delete|get rid of|take .* off|don'?t (need|want|show)|can go|clutter\w*)\b", re.I)
SHOW_VERBS = re.compile(r"\b(show|unhide|restore|bring .* back|put .* back|get .* back|add|display|see .* again|visible|again|disappeared|where did|missing)\b", re.I)

Intent = Literal[
    "group_grid", "pivot_grid", "filter_data", "sort_data", "hide_columns", "show_columns",
    "query_data", "create_chart", "format_column", "aggregate_data", "clear_grouping", "unknown",
]

# Example phrasings per intent. Deliberately varied — colloquial, terse,
# wordy — and deliberately including forms the browser's regex rules do NOT
# catch, since those are the ones that reach this server.
INTENT_EXAMPLES: dict[str, list[str]] = {
    "group_grid": [
        "group by sector", "group the rows by desk", "roll up by currency", "bucket the positions by rating",
        "break it down by issuer", "aggregate by desk and sum notional", "one row per sector with totals",
        "collapse the rows into sectors", "summarise by trader", "nest the rows under asset class",
        "group by desk then by currency", "subtotals by sector",
    
        "split it out by desk", "split the positions by sector", "can you break the book down by currency", "by desk please",
    ],
    "pivot_grid": [
        "pivot by currency", "pivot sector against currency", "cross tab desk by rating",
        "sectors down the side and currencies across the top", "make a pivot table of notional by desk and currency",
        "pivot the grid on currency", "matrix of desk versus currency", "crosstab by rating",
    ],
    "filter_data": [
        "show only Financials", "just the Rates desk", "only rows where notional is over 1 million",
        "filter to USD", "hide everything except investment grade", "exclude the Rates desk",
        "where sector is Financials", "restrict to bonds maturing after 2030", "limit it to the Credit desk",
        "keep only positive pnl", "drop rows with zero notional", "I only want to see USD positions",
    
        "I only care about the Rates desk", "I only want USD", "just USD please", "nothing but investment grade",
    
        "only the ones over 10 million", "just the big positions", "the ones under a million only", "positions above 5m only",
    ],
    "sort_data": [
        "sort by notional descending", "order by yield", "biggest notional at the top", "largest first",
        "smallest positions first", "rank by market value", "highest dv01 first", "arrange by maturity date",
        "sort by desk then by market value", "put the biggest ones on top", "stop sorting", "sort ascending by ticker",
    
        "most expensive first", "highest market value first", "most valuable at the top", "biggest first",
    ],
    "hide_columns": [
        "hide cusip", "remove the isin column", "get rid of the ticker column", "I don't need the currency column",
        "take cusip off the grid", "hide the id columns", "drop the coupon column from view", "don't show ratings",
    
        "lose the ticker column", "kill the isin column", "ditch the currency column", "cusip can go",
    ],
    "show_columns": [
        "show cusip", "put cusip back", "bring back the isin column", "unhide currency", "add the coupon column",
        "I want to see the rating column again", "display the maturity column", "restore the hidden columns",
    
        "where did the coupon column go", "the rating column disappeared, bring it back", "get the isin column back",
    ],
    "query_data": [
        "what is the total notional", "how much notional do we have per desk", "how many positions are there",
        "top 10 positions by market value", "which bonds mature before 2030", "list the largest positions",
        "what's our exposure to Financials", "give me the notional by sector", "show me the biggest positions",
        "how many trades per desk", "which desk has the most dv01", "find positions with negative pnl",
    ],
    "create_chart": [
        "pie chart of notional by sector", "bar chart of dv01 by desk", "chart market value by currency",
        "plot notional over maturity", "draw a graph of pnl by trader", "visualise exposure by rating",
        "show that as a pie", "line chart of yield by maturity", "graph it", "make a chart of notional per desk",
    ],
    "format_column": [
        "make yield two decimals", "right align the notional column", "format price with 4 decimals",
        "show pnl in red and green", "colour negative values red", "widen the description column",
        "make the ticker bold", "rename market value to mkt val", "format notional with thousands separators",
        "left align the desk column", "add a percent sign to yield",
    
        "two dp on yield", "2 decimal places for price", "one decimal on duration please", "no decimals on notional",
    ],
    "aggregate_data": [
        "total notional", "sum of market value", "average yield", "count of positions", "what's the total dv01",
        "overall exposure", "mean coupon", "max notional", "total pnl for the book", "grand total of notional",
    
        "what does notional add up to", "add up all the market value", "sum everything in the pnl column", "total for the whole book",
    ],
    "clear_grouping": [
        "clear grouping", "undo the grouping", "flatten the grid", "remove the pivot", "ungroup", "back to flat rows",
        "turn off grouping", "no more groups", "reset the layout to plain rows", "take the grouping off",
    
        "back to the plain list", "go back to normal rows", "show me the flat grid again", "drop the grouping",
    ],
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
where only all please can you sum total average avg count min max mean top bottom what which how is are was
like today now this that these those it them same put back make""".split())


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
    value: Union[str, float, list[str]]


class Entities(BaseModel):
    columns: list[str] = Field(default_factory=list)
    unresolved: list[str] = Field(default_factory=list)
    aggregations: dict[str, str] = Field(default_factory=dict)
    sortDirection: Optional[str] = None
    filters: list[FilterClause] = Field(default_factory=list)
    chartKind: Optional[str] = None
    limit: Optional[int] = None


class ParseResponse(BaseModel):
    intent: Intent
    confidence: float
    entities: Entities
    model: str
    latencyMs: int


@lru_cache(maxsize=1)
def embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL)


@lru_cache(maxsize=1)
def example_index():
    """Embed the example bank once. Returns (matrix, labels) aligned by row."""
    labels: list[str] = []
    texts: list[str] = []
    for intent, examples in INTENT_EXAMPLES.items():
        for ex in examples:
            labels.append(intent)
            texts.append(ex)
    vecs = embedder().encode(texts, normalize_embeddings=True)
    return vecs, labels


def classify(text: str) -> tuple[Intent, float]:
    """Nearest-example intent. Score = best cosine similarity to any example
    of the winning intent; the runner-up intent's best similarity is used as
    a margin check so a sentence equidistant from two intents is reported as
    unsure rather than confidently wrong."""
    vecs, labels = example_index()
    q = embedder().encode([text], normalize_embeddings=True)[0]
    sims = vecs @ q
    best_by_intent: dict[str, float] = {}
    for sim, label in zip(sims, labels):
        if sim > best_by_intent.get(label, -1.0):
            best_by_intent[label] = float(sim)
    ranked = sorted(best_by_intent.items(), key=lambda kv: -kv[1])
    (top, top_sim), (second, second_sim) = ranked[0], ranked[1]
    decided_by_verb = False
    if "hide_columns" in (top, second) and "show_columns" in (top, second) and top_sim - second_sim < 0.2:
        hide, show = bool(HIDE_VERBS.search(text)), bool(SHOW_VERBS.search(text))
        if hide != show:
            top, decided_by_verb = ("hide_columns" if hide else "show_columns"), True
    margin = top_sim - second_sim
    # A strong match wins even with a close runner-up; only a weak AND close
    # call is genuinely ambiguous. Siblings and verb-decided pairs never are.
    ambiguous = (not decided_by_verb and margin < 0.02 and top_sim < 0.6
                 and frozenset({top, second}) not in SIBLINGS)
    if top_sim < INTENT_MIN_SIM or ambiguous:
        return "unknown", round(top_sim, 3)
    return top, round(top_sim, 3)  # type: ignore[return-value]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_column(phrase: str, columns: list[Column]) -> Optional[str]:
    """Exact/prefix/substring first (cheap, precise), then embedding similarity."""
    p = _norm(phrase)
    if len(p) < 3 or not columns:
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
        # Fuzzy/semantic fallbacks only for phrases long enough to mean something:
        # a 3-letter word will always be "similar" to some header.
        if len(phrase) < 5:
            return None
        if scored and scored[0][0] >= 85:
            return scored[0][1].colId
        model = embedder()
        vecs = model.encode([phrase] + [c.headerName for c in columns], normalize_embeddings=True)
        sims = vecs[1:] @ vecs[0]
        i = int(sims.argmax())
        if float(sims[i]) >= 0.7:
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


def parse_value(raw: str) -> Union[str, float]:
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
    found: list[tuple[int, str]] = []
    for phrase in candidate_phrases(text):
        key = phrase.lower()
        if any(key in c for c in claimed):
            continue
        col = resolve_column(phrase, columns)
        if col:
            if col not in seen:
                found.append((lower.find(key), col))
                seen.add(col)
            claimed.append(key)
    ents.columns = [c for _, c in sorted(found)]

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
    return {"ok": True, "model": EMBED_MODEL, "intentExamples": sum(len(v) for v in INTENT_EXAMPLES.values())}


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
        model=EMBED_MODEL, latencyMs=int((time.perf_counter() - t0) * 1000),
    )
