# BTA Intelligence API

A FastAPI-based intelligence platform for the Budtenders Association (BTA) that combines:

- LLM-powered analysis (AI agent)
- Retrieval-Augmented Generation (RAG)
- PostgreSQL analytics querying
- Machine learning clustering (K-Means)
- Automated chart generation
- Document ingestion and embedding pipeline

---

# 🧠 System Overview

This system acts as a **data intelligence assistant** that can:

- Answer natural language business questions
- Generate SQL dynamically from prompts
- Retrieve relevant internal documents (RAG)
- Perform user segmentation using K-Means clustering
- Produce structured chart-ready outputs
- Process uploaded documents into searchable embeddings

---

# 🏗️ Architecture

```
Backend App
│
├── ai_provider
├── analytics/
├── api/
├── core/
├── db/
├── docs/
├── ml/
├── rag/
├── schemas/
│
├── .env
├── .env.example
├── .gitignore
├── PROJECT.md
├── README.md
└── requirements.txt
```

---

# 🚀 Features

## 1. AI Chat Agent

- Converts natural language → SQL
- Executes queries safely
- Iteratively refines responses using DB feedback
- Enforces strict schema constraints

---

## 2. RAG (Retrieval-Augmented Generation)

- Loads internal document chunks (`doc_chunks.json`)
- Generates embeddings for semantic search
- Retrieves top relevant chunks per query
- Injects context into LLM prompts

---

## 3. SQL Intelligence Layer

- Schema-locked query generation (prevents hallucinations)
- Supports analytics across:
  - Brand performance
  - User behavior
  - Survey responses
  - Cohort benchmarks

---

## 4. Clustering Engine (K-Means)

- Segments users based on behavioral indices
- Pipeline:
  - Imputation (SimpleImputer)
  - Scaling (StandardScaler)
  - Clustering (KMeans)
- Outputs:
  - Cluster sizes
  - Role distributions
  - Province breakdowns
  - Feature averages

---

## 5. Chart Generator

Automatically produces visualization-ready JSON.

### Supported charts:

- Horizontal bar charts
- Grouped bar charts
- Line charts

### Trigger logic:

- Trend analysis
- Survey gap detection
- Segment analysis
- Predictive insights

---

## 6. Document Upload System

Supports:

- PDF
- DOCX
- CSV

### Pipeline:

1. Extract text
2. Chunk into segments (600 chars + overlap)
3. Generate embeddings
4. Store in memory + disk
5. Append to RAG index

---

# 📡 API Endpoints

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
  "message": "Which provinces have lowest engagement?",
  "history": []
}
```

### Response:

```json
{
  "reply": "Generated analytical response...",
  "chart_data": {}
}
```

### Behavior:

- Detects intent (SQL / clustering / analytics)
- Retrieves relevant documents (RAG)
- Generates SQL via LLM
- Executes queries
- Injects results back into LLM
- Returns final response

---

## Upload Endpoint

```
POST /upload
```

### Form-data:

- file: PDF | DOCX | CSV

### Response:

```json
{
  "message": "Uploaded file.pdf",
  "chunks_added": 42,
  "total_chunks": 1200
}
```

---

# 🧩 Core Modules

## Agent (`run_agent`)

Handles:

- Prompt construction
- SQL generation loop
- Execution of SQL
- Final response synthesis

Key behavior:

- Up to 6 refinement iterations
- Injects DB results back into prompt
- Removes SQL before final response

---

## RAG System

Functions:

- `load_chunks()`
- `search_docs()`

Flow:

```
User Query
 → Embed query
 → Cosine similarity search
 → Retrieve top documents
 → Inject into LLM context
```

---

## Database Layer

Function:

- `run_query(sql)`

Lifecycle:

- Startup → connection pool created
- Shutdown → pool closed

---

## Clustering (KMeans)

Function:

- `run_kmeans()`

Steps:

1. Fetch user data
2. Pivot into feature matrix
3. Impute missing values
4. Normalize
5. Apply KMeans clustering
6. Generate cluster summaries

---

## Chart Builder

Function:

- `build_chart_data()`

Detects:

- Trends
- Survey gaps
- Archetypes
- Predictive signals

Outputs:
Structured JSON for frontend visualization.

---

# 🧪 Tech Stack

- FastAPI
- asyncpg
- pandas
- numpy
- scikit-learn
- python-dotenv
- PyMuPDF
- python-docx

---

# 🔍 Embedding System

Powered by `EmbeddingService`

Used for:

- Semantic search
- RAG retrieval
- Vector similarity matching

---

# 🧠 AI Layer

Powered by `AIService`

Responsibilities:

- SQL generation
- Response reasoning
- Multi-step inference loop

---

# 🔄 Request Flow

```
User Message
 → /chat endpoint
 → run_agent()
 → RAG search (optional)
 → LLM generates SQL
 → DB execution
 → Results injected back into LLM
 → Final response generated
 → Chart detection (optional)
 → Response returned
```

---

# 📌 Design Principles

- Strict schema enforcement (no hallucinated SQL)
- Separation of concerns (API / DB / ML / RAG / AI)
- Async-first architecture
- Iterative LLM reasoning loop
- Hybrid intelligence (rules + ML + LLM)

---

# 🚀 Running the Server

## Development

```
uvicorn db.client:app --reload
```

## Production

```
uvicorn db.client:app --host 0.0.0.0 --port 8000

```

---

# 📦 Dependencies

- FastAPI
- asyncpg
- pandas
- numpy
- scikit-learn
- python-dotenv
- PyMuPDF
- python-docx

---

# 🧭 Future Improvements

- Replace file-based embeddings with vector DB (pgvector / Pinecone)
- Stream LLM responses
- Add observability (OpenTelemetry)
- Migrate startup to FastAPI lifespan fully

---

# 📊 Summary

This system is a **hybrid AI intelligence engine** combining:

- LLM reasoning
- SQL execution
- Semantic search (RAG)
- Machine learning clustering
- Automated visualization

It functions as a **self-improving business intelligence assistant** for structured and unstructured data analysis.
