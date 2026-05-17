# BTA Intelligence API — Project Setup Guide

This guide explains how to set up, install dependencies, configure environment variables, and run the FastAPI server from scratch.

---

# 🧱 1. Project Structure

```
Backend App
│
├── ai_provider
│   ├── ai_service
│   ├── anthropic_provider
│   └── gemini_provider
│
├── analytics/
│   ├── chart generation logic
│   └── business intelligence queries
│
├── api/
│   ├── /upload
│   └── /health
│
├── core/
│   ├── agent(LLM reasoning)
│   └── Embedding_service
│
├── db/
│   ├── client
│   └── schema
│
├── docs/
│   ├── 2026-03-10
│   ├── 2026-03-16
│   └── 2026-03-18
│
├── ml/
│   ├── KMeans clustering
│   └── user segmentation insights
│
├── rag/
│   ├── document chunking
│   ├── embedding generation
│   └── semantic search
│
├── schemas/
│   ├──
│   └── models
│
├── .env
├── .env.example
├── .gitignore
├── PROJECT.md
├── README.md
└── requirements.txt
```

---

# ⚙️ 2. Requirements

## Python Version

```
Python 3.10+
```

## System Dependencies

- PostgreSQL database
- venv
- GPU for embeddings (Optional)

---

# 📦 3. Create Virtual Environment

## macOS / Linux

```
python3 -m venv venv
source venv/bin/activate
```

## Windows

```
python -m venv venv
venv\Scripts\activate
```

---

# 📥 4. Install Dependencies

```
pip install -r requirements.txt
```

---

# 🔐 5. Environment Variables Setup

Create a `.env` file in the root directory and follow `.env.example` to complete the setup

---

# 🗄️ 6. Database Setup

Ensure PostgreSQL is running and your schema exists:

### Required schemas:

- analytics_gold
- analytics_marts

### Required tables:

- mart_bhi_brand_scores
- mart_user_scores
- dim_users
- dim_questions
- fct_survey_responses

---

# 📚 7. First-Time Data Setup (RAG)

If running for the first time:

### 1. Add documents

Place files in:

```
/docs
```

Supported formats:

- PDF
- DOCX
- CSV

---

### 2. Generate chunks + embeddings

On first run, system automatically:

- Loads documents
- Splits into chunks
- Generates embeddings
- Saves:
  - `Redis Cache`

---

# 🚀 8. Running the Server

## Development Mode (Auto-reload)

```
uvicorn db.client:app --reload
```

---

## Production Mode

```
uvicorn db.client:app --reload --host 0.0.0.0 --port 8000
```

---

# 🌐 9. Server Access

Once running:

```
http://127.0.0.1:8000
```

---

# 📡 10. API Endpoints

## Health Check

```
GET /
```

### Response:

```json
{
  "status": "ok",
  "service": "BTA Intelligence API"
}
```

---

## Chat Endpoint

```
POST /chat
```

### Request:

```json
{
  "message": "Show me brand performance trends",
  "history": []
}
```

---

## Upload Documents

```
POST /upload
```

### Form-data:

- file (PDF / DOCX / CSV)

---

# 🔁 11. Startup Lifecycle Flow

When server starts:

```
uvicorn starts
   ↓
FastAPI app loads
   ↓
DB connection pool created
   ↓
Redis connection initialized
   ↓
RAG documents loaded
   ↓
Embeddings loaded or generated
   ↓
Server ready to accept requests
```

---

# 🧠 12. Key System Components

## Database Layer

- asyncpg connection pool
- query execution via `run_query()`

---

## RAG System

- chunk-based document retrieval
- cosine similarity search
- embedding-based retrieval

---

## AI Agent

- converts natural language → SQL
- executes queries
- refines responses iteratively

---

## ML Layer

- KMeans clustering
- user segmentation
- behavioral grouping

---

## Analytics Engine

- dynamic chart generation
- KPI aggregation
- trend detection

---

# 🔴 Redis Cache Layer

## Redis Usage

Redis is used for:

- AI response caching
- embedding caching
- semantic search caching
- RAG chunk caching
- SQL query caching

## AI Response Cache

- caches repeated AI requests
- reduces latency
- reduces API costs
- lowers provider load

---

## Embedding Cache

- avoids regenerating embeddings
- improves RAG performance
- reduces embedding API usage

---

## Semantic Search Cache

- caches repeated semantic queries
- improves retrieval speed
- reduces vector computation overhead

---

## SQL Query Cache

- improves dashboard performance
- speeds up KPI aggregation
- reduces repeated database load

---

## Chat Session Cache

- stores temporary conversation memory
- supports multi-turn conversations
- enables session persistence

---

# 🎯 13. Final Command

## Start server:

```
uvicorn db.client:app --reload
```

---

# ✅ Done

BTA Intelligence API is now fully set up and ready to:

- Serve AI chat requests
- Query PostgreSQL
- Run RAG retrieval
- Perform clustering
- Generate analytics charts

---

# 🧭 14. Recommended Run Order

If setting up fresh:

```
1. Create venv
2. Install dependencies
3. Configure .env
4. Start PostgreSQL
5. Run uvicorn
```

---

# ⚠️ 15. Common Issues

## DB connection fails

- Check DATABASE_URL
- Ensure PostgreSQL is running

---

## embeddings not generated

- Ensure /docs has files
- Check permissions

---

## uvicorn not found

```
pip install -r requirements.tx
```
