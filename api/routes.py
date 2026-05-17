import os, json, hashlib, logging
from fastapi import HTTPException, UploadFile, File
from schemas.models import ChatRequest, ChatResponse
from core.embedding_service import EmbeddingService
from core.agent import run_agent
from db.client import app_with_middleware, redis_client

logger = logging.getLogger(__name__)
embedding_service = EmbeddingService()


# health()
@app_with_middleware.get("/")
async def health():
    """
    Health check endpoint.

    This endpoint is used to verify that the FastAPI application
    is running and responsive.

    Route:
        GET /

    Returns:
        dict:
            Example response:
                {
                    "status": "ok",
                    "service": "BTA Intelligence FastAPI"
                }

    Purpose:
        - Service monitoring
        - Deployment health checks
        - Load balancer verification
        - Uptime testing
    """

    return {"status": "ok", "service": "BTA Intelligence FastAPI"}


# chat()
@app_with_middleware.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Handle chat requests through the AI agent pipeline.

    Accepts a user message and optional chat history, then returns
    an AI-generated reply with optional chart data.

    Args:
        req (ChatRequest):
            Incoming chat request payload.

    Returns:
        ChatResponse:
            AI reply and chart visualization data.

    Raises:
        HTTPException:
            400 if the message is missing.
            500 if processing fails.
    """

    if not req.message:
        raise HTTPException(status_code=400, detail="message is required")
    try:
        reply, chart_data = await run_agent(req.message, req.history or [])
        return ChatResponse(reply=reply, chart_data=chart_data)
    except Exception as e:
        logger.error(f" error {e}")
        raise HTTPException(status_code=500, detail=str(e))


# upload_doc()
@app_with_middleware.post("/upload")
async def upload_doc(file: UploadFile = File(...)):
    """
    Upload and index documents for RAG with Redis caching.
    """

    fname = file.filename
    ext = os.path.splitext(fname)[1].lower()

    if ext not in [".pdf", ".docx", ".csv"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use PDF, DOCX, or CSV",
        )

    save_dir = os.path.join(os.path.dirname(__file__), "docs")
    os.makedirs(save_dir, exist_ok=True)

    save_path = os.path.join(save_dir, fname)
    contents = await file.read()

    with open(save_path, "wb") as f:
        f.write(contents)

    try:
        text = ""

        # TEXT EXTRACTION
        if ext == ".pdf":
            import fitz

            doc = fitz.open(save_path)
            text = "\n".join(page.get_text() for page in doc)

        elif ext == ".docx":
            from docx import Document

            doc = Document(save_path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        elif ext == ".csv":
            import csv

            with open(save_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            text = "\n".join(
                " | ".join(f"{k}: {v}" for k, v in row.items()) for row in rows[:200]
            )

        # CHUNKING
        chunk_size = 600
        overlap = 100

        new_chunks = []
        i = 0

        while i < len(text):
            chunk = text[i : i + chunk_size].strip()

            if chunk and len(chunk) > 50:
                new_chunks.append(
                    {
                        "source": fname,
                        "text": chunk,
                    }
                )

            i += chunk_size - overlap

        texts = [c["text"] for c in new_chunks]

        # EMBEDDING + REDIS CACHE
        embeddings = []

        for i in range(0, len(texts), 20):

            batch = texts[i : i + 20]

            batch_embeddings = []
            uncached_texts = []
            uncached_indexes = []

            # CACHE CHECK
            for idx, chunk_text in enumerate(batch):

                chunk_hash = hashlib.md5(chunk_text.encode()).hexdigest()

                cache_key = f"embedding:{chunk_hash}"

                cached = await redis_client.get(cache_key)

                if cached:
                    batch_embeddings.append(json.loads(cached))
                else:
                    batch_embeddings.append(None)
                    uncached_texts.append(chunk_text)
                    uncached_indexes.append(idx)

            # GENERATE MISSING
            if uncached_texts:

                generated = await embedding_service.embed(uncached_texts)

                for idx, emb in zip(uncached_indexes, generated):

                    emb_list = emb.tolist() if hasattr(emb, "tolist") else emb

                    batch_embeddings[idx] = emb_list

                    chunk_hash = hashlib.md5(batch[idx].encode()).hexdigest()

                    cache_key = f"embedding:{chunk_hash}"

                    await redis_client.set(
                        cache_key,
                        json.dumps(emb_list),
                        ex=60 * 60 * 24 * 7,
                    )

            embeddings.extend(batch_embeddings)

        # STORE IN REDIS
        if new_chunks:
            await redis_client.rpush("rag:chunks", *[json.dumps(c) for c in new_chunks])

        await redis_client.rpush("rag:embeddings", *[json.dumps(e) for e in embeddings])

        total_chunks = await redis_client.llen("rag:chunks")

        return {
            "message": f"Uploaded {fname}",
            "chunks_added": len(new_chunks),
            "total_chunks": total_chunks,
            "embeddings_cached_or_generated": len(embeddings),
        }

    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=str(e))
