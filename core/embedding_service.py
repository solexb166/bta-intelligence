import os, json, hashlib
import asyncio
import numpy as np
from google import genai
from db.client import redis_client


class EmbeddingService:
    """
    EmbeddingService generates vector embeddings using Google's Gemini embedding model.

    It supports:
        - Batch embedding (multiple texts)
        - Single text embedding

    Features:
        - Batch text embedding with caching support
        - Single text embedding with caching support
        - Redis-backed deduplication to avoid recomputation
    """

    def __init__(self):
        """
        Initializes the Gemini embedding client.

        The API key is read from the `GEMINI_API_KEY` environment variable.
        """

        self.client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def embed(self, texts: list[str]):
        """
        Generates embeddings for a list of input texts with Redis caching.

        For each text:
            - Checks Redis cache first
            - Computes embeddings only for missing entries
            - Stores newly computed embeddings back into Redis

        Args:
            texts (list[str]):
                List of input strings to embed.

        Returns:
            list[np.ndarray]:
                List of embedding vectors (NumPy arrays) in the same order
                as the input texts.

        Notes:
            - Returns an empty list if input `texts` is empty.
            - Maintains input order even when mixing cached and computed results.
        """

        if not texts:
            return []

        results = []
        missing_texts = []
        missing_indexes = []

        # CHECK CACHE FIRST
        for i, text in enumerate(texts):
            key = f"emb:one:{hashlib.md5(text.encode()).hexdigest()}"
            cached = await redis_client.get(key)

            if cached:
                results.append(np.array(json.loads(cached)))
            else:
                results.append(None)
                missing_texts.append(text)
                missing_indexes.append(i)

        # COMPUTE ONLY MISSING ONES
        if missing_texts:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.models.embed_content(
                    model="gemini-embedding-001",
                    contents=missing_texts,
                ),
            )

            new_embeddings = [np.array(emb.values) for emb in result.embeddings]

            # store in redis + fill results
            for idx, text, emb in zip(missing_indexes, missing_texts, new_embeddings):
                cache_key = f"emb:one:{hashlib.md5(text.encode()).hexdigest()}"

                await redis_client.set(
                    cache_key,
                    json.dumps(emb.tolist()),
                    ex=86400,
                )

                results[idx] = emb

        return results

    async def embed_one(self, text: str):
        """
        Generates an embedding for a single text input with Redis caching.

        Args:
            text (str):
                The input string to embed.

        Returns:
            np.ndarray:
                Embedding vector as a NumPy array.

        Notes:
            - Uses Redis cache to avoid recomputation.
            - Cache TTL is 24 hours.
        """

        cache_key = f"emb:one:{hashlib.md5(text.encode()).hexdigest()}"

        cached = await redis_client.get(cache_key)
        if cached:
            return np.array(json.loads(cached))

        result = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.client.models.embed_content(
                model="gemini-embedding-001",
                contents=[text],
            ),
        )

        embedding = np.array(result.embeddings[0].values)

        await redis_client.set(
            cache_key,
            json.dumps(embedding.tolist()),
            ex=86400,  # 24h cache
        )

        return embedding
