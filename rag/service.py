import os, json
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from core.embedding_service import EmbeddingService
from db.client import redis_client
import logging

logger = logging.getLogger(__name__)
embedding_service = EmbeddingService()

CHUNKS = []
CHUNK_EMBEDDINGS = []


# load_chunks()
async def load_chunks():
    """
    Initialize the RAG document store by loading chunks and embeddings.

    Loads document chunks from disk and either restores cached embeddings
    or regenerates them if missing/corrupted.

    Process:
        1. Load chunks from doc_chunks.json
        2. Load embeddings from cache if available
        3. Otherwise regenerate embeddings in batches
        4. Store results in global memory

    Globals:
        CHUNKS:
            Loaded document chunks.

        CHUNK_EMBEDDINGS:
            Corresponding embedding vectors.

    Returns:
        None
    """

    global CHUNKS, CHUNK_EMBEDDINGS

    chunks_raw = await redis_client.lrange("rag:chunks", 0, -1)
    embeddings_raw = await redis_client.lrange("rag:embeddings", 0, -1)

    if not chunks_raw:
        logger.info("No chunks in Redis — RAG disabled")
        return [], []

    chunks = [json.loads(chunk) for chunk in chunks_raw]

    logger.info(f"Loaded {len(chunks)} document chunks")

    if embeddings_raw:

        try:
            logger.info("Loading cached embeddings...")

            embeddings = [
                np.array(json.loads(element), type=np.float32)
                for element in embeddings_raw
            ]

            logger.info(f"Loaded {len(embeddings)} embeddings from Redis")
            return chunks, embeddings
        except Exception as e:
            logger.error(f"Cache corrupted ({e}), regenerating...")

        return

    logger.info("Rebuilding embeddings...")

    texts = [chunk["text"] for chunk in chunks]
    batch_size = 20
    embeddings = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]

        batch_embeddings = await embedding_service.embed(batch)

        for batch_embed in batch_embeddings:
            embedding_list = (
                batch_embed.tolist() if hasattr(batch_embed, "tolist") else batch_embed
            )
            embeddings.append(np.array(embedding_list, dtype=np.float32))

    await redis_client.delete("rag:embeddings")

    await redis_client.rpush(
        "rag:embeddings", *[json.dumps(element.tolist) for element in embeddings]
    )

    logger.info(f"Rebuilt embeddings: {len(embeddings)}")

    return chunks, embeddings


# search_docs()
async def search_docs(query: str, top_k: int = 5):
    """
    Perform semantic search over document chunks using cosine similarity.

    Generates a query embedding and compares it against stored document
    embeddings to retrieve the most relevant chunks.

    Args:
        query (str):
            User search query.

        top_k (int, optional):
            Number of top results to return. Defaults to 5.

    Returns:
        list[dict]:
            Ranked matching chunks with text, source, and similarity score.

            Returns empty list if no valid matches are found or data is missing.

    """

    chunks_raw = await redis_client.lrange("rag:chunks", 0, -1)
    embeddings_raw = await redis_client.lrange("rag:embeddings", 0, -1)

    if not chunks_raw or not embeddings_raw:
        return []

    chunks = [json.loads(c) for c in chunks_raw]
    doc_vecs = np.array(
        [json.loads(e) for e in embeddings_raw],
        dtype=np.float32,
    )

    # query embedding
    q_vec = await embedding_service.embed_one(query)
    q_vec = np.array(q_vec, dtype=np.float32).reshape(1, -1)

    scores = cosine_similarity(q_vec, doc_vecs)[0]

    top_indices = scores.argsort()[-top_k:][::-1]

    return [
        {
            "text": chunks[i]["text"],
            "source": chunks[i]["source"],
            "score": float(scores[i]),
        }
        for i in top_indices
        if scores[i] > 0.4
    ]
