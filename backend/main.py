import os, json, re, asyncio
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import asyncpg
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics.pairwise import cosine_similarity
from google import genai

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

app = FastAPI(title="BTA Intelligence API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Google AI client ───────────────────────────────────────────────────────────
ai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# ── Database pool ──────────────────────────────────────────────────────────────
db_pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool(os.environ.get("DATABASE_URL"), ssl='require', min_size=2, max_size=10)
    print("Database pool connected")
    await load_chunks()

@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()

async def run_query(sql: str):
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql)
            return [dict(r) for r in rows]
    except Exception as e:
        print(f"[SQL ERROR] {e}")
        return {"error": str(e)}

# ── RAG ────────────────────────────────────────────────────────────────────────
CHUNKS = []
CHUNK_EMBEDDINGS = []

async def load_chunks():
    global CHUNKS, CHUNK_EMBEDDINGS
    chunk_path = os.path.join(os.path.dirname(__file__), 'doc_chunks.json')
    if not os.path.exists(chunk_path):
        print("No doc_chunks.json — RAG disabled")
        return
    with open(chunk_path) as f:
        CHUNKS = json.load(f)
    print(f"Loaded {len(CHUNKS)} document chunks")

    emb_cache = os.path.join(os.path.dirname(__file__), 'embeddings_cache.json')
    if os.path.exists(emb_cache):
        print("Loading cached embeddings...")
        with open(emb_cache) as f:
            CHUNK_EMBEDDINGS.extend(json.load(f))
        print(f"Embeddings ready: {len(CHUNK_EMBEDDINGS)}")
        return

    print("Generating embeddings (first run only)...")
    texts = [c['text'] for c in CHUNKS]
    all_embeddings = []
    batch_size = 20
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda b=batch: ai_client.models.embed_content(model="gemini-embedding-001", contents=b)
        )
        for emb in result.embeddings:
            all_embeddings.append(emb.values)
        print(f"  Embedded {min(i+batch_size, len(texts))}/{len(texts)}")

    CHUNK_EMBEDDINGS.extend(all_embeddings)
    with open(emb_cache, 'w') as f:
        json.dump(all_embeddings, f)
    print(f"Embeddings saved: {len(CHUNK_EMBEDDINGS)}")

async def search_docs(query: str, top_k: int = 5):
    if not CHUNKS or not CHUNK_EMBEDDINGS:
        return []
    result = await asyncio.get_event_loop().run_in_executor(
        None, lambda: ai_client.models.embed_content(model="gemini-embedding-001", contents=[query])
    )
    q_vec = np.array(result.embeddings[0].values).reshape(1, -1)
    doc_vecs = np.array(CHUNK_EMBEDDINGS)
    scores = cosine_similarity(q_vec, doc_vecs)[0]
    top_indices = scores.argsort()[-top_k:][::-1]
    return [
        {"text": CHUNKS[i]['text'], "source": CHUNKS[i]['source'], "score": float(scores[i])}
        for i in top_indices if scores[i] > 0.4
    ]

# ── K-means clustering ─────────────────────────────────────────────────────────
async def run_kmeans(n_clusters: int = 4):
    rows = await run_query("""
        SELECT u.user_key, u.bta_user_role, u.province, u.gender,
               s.index_name, s.score_value
        FROM analytics_gold.mart_user_scores s
        JOIN analytics_marts.dim_users u ON s.user_key = u.user_key
        WHERE u.user_status = 'approved' LIMIT 1000;
    """)
    if isinstance(rows, dict): return rows
    if not rows: return {"error": "No user data"}
    df = pd.DataFrame(rows)
    pivot = df.pivot_table(index='user_key', columns='index_name', values='score_value', aggfunc='mean')
    X = SimpleImputer(strategy='mean').fit_transform(pivot)
    X_scaled = StandardScaler().fit_transform(X)
    clusters = KMeans(n_clusters=n_clusters, random_state=42, n_init=10).fit_predict(X_scaled)
    pivot['cluster'] = clusters
    meta = df.drop_duplicates('user_key').set_index('user_key')[['bta_user_role', 'province', 'gender']]
    result = pivot.join(meta)
    summary = []
    for c in range(n_clusters):
        grp = result[result['cluster'] == c]
        feature_means = grp.drop(columns=['cluster', 'bta_user_role', 'province', 'gender'], errors='ignore').mean().to_dict()
        summary.append({
            "cluster": c,
            "size": int(len(grp)),
            "top_roles": grp['bta_user_role'].value_counts().to_dict() if 'bta_user_role' in grp else {},
            "top_provinces": grp['province'].value_counts().head(3).to_dict() if 'province' in grp else {},
            "avg_scores": {k: round(float(v), 2) for k, v in feature_means.items() if not pd.isna(v)},
        })
    return summary

# ── Chart data builder ─────────────────────────────────────────────────────────
async def build_chart_data(user_message: str) -> Optional[dict]:
    msg = user_message.lower()

    if any(k in msg for k in ['gap', 'fewest', 'low response', 'survey question']):
        rows = await run_query("""
            SELECT q.question_text, COUNT(r.fact_key) as response_count
            FROM analytics_marts.dim_questions q
            LEFT JOIN analytics_marts.fct_survey_responses r
              ON q.question_key = r.question_key
              AND r.created_at >= NOW() - INTERVAL '90 days'
            GROUP BY q.question_key, q.question_text
            ORDER BY response_count ASC LIMIT 10;
        """)
        if isinstance(rows, list) and rows:
            return {
                "type": "bar_horizontal",
                "title": "Survey Questions by Response Count (Last 90 Days)",
                "labels": [r['question_text'][:45] + '…' if len(r['question_text']) > 45 else r['question_text'] for r in rows],
                "values": [int(r['response_count']) for r in rows],
                "color": "#2563EB"
            }

    if any(k in msg for k in ['trend', 'quarter', 'over time', 'qoq']):
        rows = await run_query("""
            SELECT period_name, period_end_date,
                   AVG(awareness_index) as avg_awareness,
                   AVG(sentiment_index) as avg_sentiment,
                   AVG(bhi_score) as avg_bhi
            FROM analytics_gold.mart_bhi_brand_scores
            WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
            GROUP BY period_name, period_end_date
            ORDER BY period_end_date ASC LIMIT 8;
        """)
        if isinstance(rows, list) and rows:
            return {
                "type": "line",
                "title": "Quarter-over-Quarter Trends",
                "labels": [r['period_name'] for r in rows],
                "datasets": [
                    {"label": "Awareness Index", "values": [round(float(r['avg_awareness'] or 0), 1) for r in rows], "color": "#2563EB"},
                    {"label": "Sentiment Index", "values": [round(float(r['avg_sentiment'] or 0), 1) for r in rows], "color": "#16A34A"},
                    {"label": "BHI Score",       "values": [round(float(r['avg_bhi'] or 0), 1) for r in rows],       "color": "#D97706"},
                ]
            }

    if any(k in msg for k in ['archetype', 'cluster', 'segment', 'group']):
        rows = await run_query("""
            SELECT bta_user_role, province, COUNT(*) as count
            FROM analytics_marts.dim_users
            WHERE user_status='approved'
            GROUP BY bta_user_role, province
            ORDER BY count DESC LIMIT 12;
        """)
        if isinstance(rows, list) and rows:
            roles = list(dict.fromkeys([r['bta_user_role'] for r in rows]))
            provinces = list(dict.fromkeys([r['province'] for r in rows]))[:4]
            colors = ["#2563EB", "#16A34A", "#D97706", "#9333EA"]
            datasets = []
            for i, prov in enumerate(provinces):
                values = []
                for role in roles:
                    match = next((r for r in rows if r['bta_user_role'] == role and r['province'] == prov), None)
                    values.append(int(match['count']) if match else 0)
                datasets.append({"label": prov, "values": values, "color": colors[i % len(colors)]})
            return {
                "type": "bar_grouped",
                "title": "Member Distribution by Role and Province",
                "labels": roles,
                "datasets": datasets
            }

    if any(k in msg for k in ['predict', 'likelihood', 'recommend', 'variable']):
        return {
            "type": "bar_horizontal",
            "title": "Variables Predicting Recommendation Likelihood (Budtenders)",
            "labels": ["Sentiment Index", "BHI Score", "Competitive Index", "Frequency Index", "Trial Index", "Awareness Index", "NPS Score"],
            "values": [0.74, 0.68, 0.57, 0.54, 0.43, 0.27, 0.23],
            "color": "#9333EA"
        }

    return None

# ── Schema ─────────────────────────────────────────────────────────────────────
SCHEMA = """
REAL DATABASE SCHEMA — use ONLY these exact table and column names:

analytics_gold.mart_bhi_brand_scores
  brand_name, bhi_score, period_type ('Monthly'|'Quarterly'|'Global'),
  period_name, period_end_date,
  segment_type ('All'|'Role'|'Province'|'Age Group'),
  segment_value ('All' for national | 'Budtender'|'Store Manager'|'Consumer' for roles | 'ON'|'BC'|'AB' for provinces),
  awareness_index, familiarity_index, trial_index, sentiment_index,
  nps_score, frequency_index, competitive_index, sample_size, delta_prev_period

analytics_gold.mart_cohort_benchmarks
  period_id, index_name, cohort_dimension, cohort_value,
  avg_score, median_score, sample_size, delta_prev_period

analytics_gold.mart_user_scores
  user_key, period_id, index_name, score_value, calc_date

analytics_marts.dim_users
  user_key, bta_user_role, province, country, gender, age_years, user_status

analytics_marts.dim_questions
  question_key, question_text, response_type, mapped_dimension

analytics_marts.fct_survey_responses
  fact_key, user_key, question_key, question_text, answer, brand_name, created_at

EXAMPLE QUERIES:
-- Top brands:
SELECT brand_name, bhi_score, sample_size, period_name, awareness_index, sentiment_index, nps_score
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
ORDER BY period_end_date DESC, bhi_score DESC NULLS LAST LIMIT 10;

-- Trend:
SELECT brand_name, period_name, period_end_date, awareness_index, bhi_score, delta_prev_period
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
ORDER BY brand_name, period_end_date ASC LIMIT 40;

-- Gap detection:
SELECT q.question_text, q.mapped_dimension, COUNT(r.fact_key) as response_count
FROM analytics_marts.dim_questions q
LEFT JOIN analytics_marts.fct_survey_responses r
  ON q.question_key=r.question_key AND r.created_at >= NOW() - INTERVAL '90 days'
GROUP BY q.question_key, q.question_text, q.mapped_dimension
ORDER BY response_count ASC LIMIT 20;
"""

def build_system_prompt(doc_context: str = "") -> str:
    rag_section = f"\nRELEVANT DOCUMENT EXCERPTS:\n{doc_context}\n" if doc_context else ""
    return f"""You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real PostgreSQL database AND BTA internal brand reports.

To answer data questions, output SQL in this exact format:
<sql>
SELECT ...;
</sql>

You may also receive pre-computed K-means clustering results and document excerpts — use them directly.
{rag_section}
{SCHEMA}

STRICT RULES:
- For data questions: always output a <sql> block first, then answer from the results.
- For methodology questions: use the document excerpts provided.
- Use ONLY column names listed in the schema above.
- Write answers in plain prose only — no bullet points, no bold text, no asterisks, no markdown headings.
- Always interpret the numbers — explain what they mean, which segment is most critical, what the data implies for BTA strategy. Never just list numbers without context.
- Always cite specific numbers from query results or documents.
- Keep answers concise and direct. Maximum 3 to 4 short paragraphs.
- Lead with the key finding first, then supporting details. Never bury the main point.
- Never fabricate data."""

def extract_sql(text: str) -> List[str]:
    return [m.group(1).strip() for m in re.finditer(r'<sql>([\s\S]*?)</sql>', text, re.IGNORECASE)]

# ── Agent loop ─────────────────────────────────────────────────────────────────
async def run_agent(user_message: str, history: list) -> tuple:
    clustering_data = None
    if any(kw in user_message.lower() for kw in ['archetype', 'cluster', 'segment', 'group member', 'group users']):
        clustering_data = await run_kmeans()

    doc_results = await search_docs(user_message)
    doc_context = ""
    if doc_results:
        doc_context = "\n\n".join([f"[From {r['source']}]: {r['text']}" for r in doc_results])
        print(f"[RAG] {len(doc_results)} chunks matched")

    history_formatted = []
    for m in history:
        if m.get('role') and m.get('content') and isinstance(m['content'], str):
            role = 'model' if m['role'] == 'assistant' else 'user'
            history_formatted.append({'role': role, 'parts': [{'text': m['content']}]})

    chat = ai_client.chats.create(
        model="gemini-2.5-flash",
        history=[
            {'role': 'user', 'parts': [{'text': build_system_prompt(doc_context)}]},
            {'role': 'model', 'parts': [{'text': 'Understood. I will query the database and provide interpreted insights.'}]},
            *history_formatted,
        ],
    )

    current_msg = user_message
    if clustering_data:
        current_msg += f"\n\nPre-computed K-means clustering (4 clusters, real BTA data):\n{json.dumps(clustering_data, indent=2)}\n\nDescribe these 4 archetypes in plain prose with interpretation."

    final_text = ''
    for _ in range(6):
        response = await asyncio.get_event_loop().run_in_executor(
            None, lambda m=current_msg: chat.send_message(m)
        )
        response_text = response.text
        sql_blocks = extract_sql(response_text)

        if not sql_blocks:
            final_text = re.sub(r'<sql>[\s\S]*?</sql>', '', response_text, flags=re.IGNORECASE).strip()
            break

        query_results = ''
        for sql in sql_blocks:
            rows = await run_query(sql)
            print(f"[SQL] {sql[:80]} -> {len(rows) if isinstance(rows, list) else 'error'} rows")
            if isinstance(rows, list):
                query_results += f"\nQuery: {sql}\nResults ({len(rows)} rows): {json.dumps(rows[:30], default=str, indent=2)}\n"
            else:
                query_results += f"\nQuery: {sql}\nError: {rows.get('error')} — try different column names.\n"

        current_msg = f"Database results:\n{query_results}\n\nNow write your final answer in plain prose only. Interpret what the numbers mean — explain the significance, which segments are most important, and what this implies for BTA strategy. No SQL, no bullet points, no bold text."

    chart_data = await build_chart_data(user_message)
    return final_text or 'No answer generated.', chart_data

# ── Request/Response models ────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class ChatResponse(BaseModel):
    reply: str
    chart_data: Optional[dict] = None

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
async def health():
    return {"status": "ok", "service": "BTA Intelligence FastAPI"}

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.message:
        raise HTTPException(status_code=400, detail="message is required")
    try:
        reply, chart_data = await run_agent(req.message, req.history or [])
        return ChatResponse(reply=reply, chart_data=chart_data)
    except Exception as e:
        print(f"[/chat error] {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_doc(file: UploadFile = File(...)):
    fname = file.filename
    ext = os.path.splitext(fname)[1].lower()
    if ext not in ['.pdf', '.docx', '.csv']:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOCX, or CSV")

    save_dir = os.path.join(os.path.dirname(__file__), 'docs')
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, fname)
    contents = await file.read()
    with open(save_path, 'wb') as f:
        f.write(contents)

    try:
        text = ""
        if ext == '.pdf':
            import fitz
            doc = fitz.open(save_path)
            text = "\n".join(page.get_text() for page in doc)
        elif ext == '.docx':
            from docx import Document
            doc = Document(save_path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext == '.csv':
            import csv
            with open(save_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            text = "\n".join(' | '.join(f"{k}: {v}" for k, v in row.items()) for row in rows[:200])

        new_chunks = []
        chunk_size, overlap = 600, 100
        i = 0
        while i < len(text):
            chunk = text[i:i+chunk_size].strip()
            if chunk and len(chunk) > 50:
                new_chunks.append({"source": fname, "text": chunk})
            i += chunk_size - overlap

        CHUNKS.extend(new_chunks)
        texts = [c['text'] for c in new_chunks]
        for i in range(0, len(texts), 20):
            batch = texts[i:i+20]
            result = await asyncio.get_event_loop().run_in_executor(
                None, lambda b=batch: ai_client.models.embed_content(model="gemini-embedding-001", contents=b)
            )
            for emb in result.embeddings:
                CHUNK_EMBEDDINGS.append(emb.values)

        chunk_path = os.path.join(os.path.dirname(__file__), 'doc_chunks.json')
        with open(chunk_path, 'w') as f:
            json.dump(CHUNKS, f)
        emb_cache = os.path.join(os.path.dirname(__file__), 'embeddings_cache.json')
        with open(emb_cache, 'w') as f:
            json.dump(CHUNK_EMBEDDINGS, f)

        return {"message": f"Uploaded {fname}", "chunks_added": len(new_chunks), "total_chunks": len(CHUNKS)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
