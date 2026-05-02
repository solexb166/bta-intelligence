import os, json, re
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2, psycopg2.extras
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics.pairwise import cosine_similarity
from google import genai
from google.genai import types

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)
CORS(app)

# ── Google AI client ───────────────────────────────────────────────────────────
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# ── Load document chunks for RAG ───────────────────────────────────────────────
CHUNKS = []
CHUNK_EMBEDDINGS = []

def load_chunks():
    global CHUNKS, CHUNK_EMBEDDINGS
    chunk_path = os.path.join(os.path.dirname(__file__), 'doc_chunks.json')
    if not os.path.exists(chunk_path):
        print("No doc_chunks.json found — RAG disabled")
        return
    with open(chunk_path) as f:
        CHUNKS = json.load(f)
    print(f"Loaded {len(CHUNKS)} document chunks")

    emb_cache = os.path.join(os.path.dirname(__file__), 'embeddings_cache.json')
    if os.path.exists(emb_cache):
        print("Loading cached embeddings...")
        with open(emb_cache) as f:
            CHUNK_EMBEDDINGS.extend(json.load(f))
        print(f"Embeddings loaded from cache: {len(CHUNK_EMBEDDINGS)}")
        return

    print("Generating embeddings for RAG (first run only)...")
    texts = [c['text'] for c in CHUNKS]
    batch_size = 20
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        result = client.models.embed_content(
          model="gemini-embedding-001",
            contents=batch,
        )
        for emb in result.embeddings:
            all_embeddings.append(emb.values)
        print(f"  Embedded {min(i+batch_size, len(texts))}/{len(texts)}")

    CHUNK_EMBEDDINGS.extend(all_embeddings)

    with open(emb_cache, 'w') as f:
        json.dump(all_embeddings, f)
    print(f"Embeddings saved to cache: {len(CHUNK_EMBEDDINGS)}")

def search_docs(query, top_k=5):
    if not CHUNKS or not CHUNK_EMBEDDINGS:
        return []
    result = client.models.embed_content(
       model="gemini-embedding-001",
        contents=[query],
    )
    q_vec = np.array(result.embeddings[0].values).reshape(1, -1)
    doc_vecs = np.array(CHUNK_EMBEDDINGS)
    scores = cosine_similarity(q_vec, doc_vecs)[0]
    top_indices = scores.argsort()[-top_k:][::-1]
    return [
        {"text": CHUNKS[i]['text'], "source": CHUNKS[i]['source'], "score": float(scores[i])}
        for i in top_indices if scores[i] > 0.4
    ]

# ── DB connection ──────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"), sslmode='require')

def run_query(sql):
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql)
        rows = cur.fetchall()
        cur.close(); conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"[SQL ERROR] {e}")
        return {"error": str(e)}

# ── K-means clustering ─────────────────────────────────────────────────────────
def run_kmeans(n_clusters=4):
    rows = run_query("""
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
    imp = SimpleImputer(strategy='mean')
    X = imp.fit_transform(pivot)
    X_scaled = StandardScaler().fit_transform(X)
    clusters = KMeans(n_clusters=n_clusters, random_state=42, n_init=10).fit_predict(X_scaled)
    pivot['cluster'] = clusters
    meta = df.drop_duplicates('user_key').set_index('user_key')[['bta_user_role','province','gender']]
    result = pivot.join(meta)

    summary = []
    for c in range(n_clusters):
        grp = result[result['cluster']==c]
        feature_means = grp.drop(columns=['cluster','bta_user_role','province','gender'], errors='ignore').mean().to_dict()
        summary.append({
            "cluster": c,
            "size": int(len(grp)),
            "top_roles": grp['bta_user_role'].value_counts().to_dict() if 'bta_user_role' in grp else {},
            "top_provinces": grp['province'].value_counts().head(3).to_dict() if 'province' in grp else {},
            "avg_scores": {k: round(float(v),2) for k,v in feature_means.items() if not pd.isna(v)},
        })
    return summary

# ── Schema ─────────────────────────────────────────────────────────────────────
SCHEMA = """
REAL DATABASE SCHEMA:

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

def build_system_prompt(doc_context=""):
    rag_section = f"\nRELEVANT DOCUMENT EXCERPTS (from BTA internal reports):\n{doc_context}\n" if doc_context else ""
    return f"""You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real PostgreSQL database AND BTA internal brand reports via RAG.

To answer data questions, output SQL in this format:
<sql>
SELECT ...;
</sql>

You may also receive pre-computed K-means clustering results and document excerpts.
{rag_section}
{SCHEMA}

STRICT RULES:
- For data questions: output a <sql> block first, then answer from results.
- For methodology or document questions: use the document excerpts provided.
- Use ONLY column names listed in the schema.
- Write answers in plain prose only — no bullet points, no bold, no asterisks, no markdown headings.
- Always cite specific numbers from results or documents.
- Never fabricate data."""

def extract_sql(text):
    return [m.group(1).strip() for m in re.finditer(r'<sql>([\s\S]*?)</sql>', text, re.IGNORECASE)]

# ── Agent loop ─────────────────────────────────────────────────────────────────
def run_agent(user_message, history):
    clustering_data = None
    if any(kw in user_message.lower() for kw in ['archetype', 'cluster', 'segment', 'group member', 'group users']):
        clustering_data = run_kmeans()

    doc_context = ""
    doc_results = search_docs(user_message)
    if doc_results:
        doc_context = "\n\n".join([f"[From {r['source']}]: {r['text']}" for r in doc_results])
        print(f"[RAG] Found {len(doc_results)} relevant chunks")

    history_formatted = []
    for m in history:
        if m.get('role') and m.get('content') and isinstance(m['content'], str):
            role = 'model' if m['role'] == 'assistant' else 'user'
            history_formatted.append({'role': role, 'parts': [{'text': m['content']}]})

    system_prompt = build_system_prompt(doc_context)

    chat = client.chats.create(
        model="gemini-2.5-flash",
        history=[
            {'role': 'user', 'parts': [{'text': system_prompt}]},
            {'role': 'model', 'parts': [{'text': 'Understood. I will query the database and use document excerpts as needed.'}]},
            *history_formatted,
        ],
    )

    current_msg = user_message
    if clustering_data:
        current_msg += f"\n\nPre-computed K-means clustering (4 clusters, real BTA data):\n{json.dumps(clustering_data, indent=2)}\n\nDescribe these 4 archetypes in plain prose."

    final_text = ''
    for _ in range(6):
        response = chat.send_message(current_msg)
        response_text = response.text
        sql_blocks = extract_sql(response_text)

        if not sql_blocks:
            final_text = re.sub(r'<sql>[\s\S]*?</sql>', '', response_text, flags=re.IGNORECASE).strip()
            break

        query_results = ''
        for sql in sql_blocks:
            rows = run_query(sql)
            print(f"[SQL] {sql[:80]} -> {len(rows) if isinstance(rows, list) else 'error'} rows")
            if isinstance(rows, list):
                query_results += f"\nQuery: {sql}\nResults ({len(rows)} rows): {json.dumps(rows[:30], default=str, indent=2)}\n"
            else:
                query_results += f"\nQuery: {sql}\nError: {rows.get('error')} — try different column names.\n"

        current_msg = f"Database results:\n{query_results}\n\nNow write your final answer in plain prose only. No SQL, no bold, no bullets."

    return final_text or 'No answer generated.'

# ── Upload endpoint ────────────────────────────────────────────────────────────
@app.route('/upload', methods=['POST'])
def upload_doc():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    fname = file.filename
    save_path = os.path.join(os.path.dirname(__file__), 'docs', fname)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    new_chunks = []
    try:
        if fname.endswith('.pdf'):
            import fitz
            doc = fitz.open(save_path)
            text = "\n".join(page.get_text() for page in doc)
        elif fname.endswith('.docx'):
            from docx import Document
            doc = Document(save_path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif fname.endswith('.csv'):
            import csv
            with open(save_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            text = "\n".join(' | '.join(f"{k}: {v}" for k,v in row.items()) for row in rows[:200])
        else:
            return jsonify({'error': 'Unsupported file type. Use PDF, DOCX, or CSV'}), 400

        chunk_size, overlap = 600, 100
        i = 0
        while i < len(text):
            chunk = text[i:i+chunk_size].strip()
            if chunk and len(chunk) > 50:
                new_chunks.append({"source": fname, "text": chunk})
            i += chunk_size - overlap

        # Add to existing chunks
        CHUNKS.extend(new_chunks)

        # Generate embeddings for new chunks
        texts = [c['text'] for c in new_chunks]
        for i in range(0, len(texts), 20):
            batch = texts[i:i+20]
            result = client.models.embed_content(model="gemini-embedding-001", contents=batch)
            for emb in result.embeddings:
                CHUNK_EMBEDDINGS.append(emb.values)

        # Save updated chunks and embeddings
        chunk_path = os.path.join(os.path.dirname(__file__), 'doc_chunks.json')
        with open(chunk_path, 'w') as f:
            json.dump(CHUNKS, f)
        emb_cache = os.path.join(os.path.dirname(__file__), 'embeddings_cache.json')
        with open(emb_cache, 'w') as f:
            json.dump(CHUNK_EMBEDDINGS, f)

        return jsonify({'message': f'Successfully uploaded {fname}', 'chunks_added': len(new_chunks), 'total_chunks': len(CHUNKS)})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    history = data.get('history', [])
    if not message:
        return jsonify({'error': 'message is required'}), 400
    try:
        reply = run_agent(message, history)
        return jsonify({'reply': reply})
    except Exception as e:
        print(f"[/chat error] {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/')
def health():
    return jsonify({'status': 'ok', 'service': 'BTA Intelligence Python API'})

# ── Start ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    load_chunks()
    print("BTA Intelligence Python API -> http://localhost:3000")
    app.run(port=3000, debug=False)
