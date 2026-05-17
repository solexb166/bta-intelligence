from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis
from dotenv import load_dotenv
import asyncpg
import os
import logging

load_dotenv()

logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="BTA Intelligence API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


# run_query()
async def run_query(sql: str):
    """
    Execute a SQL query using the shared async PostgreSQL connection pool.

    This helper function acquires a database connection from the global
    connection pool, executes the provided SQL query, and returns the
    results as a list of dictionaries.

    Args:
        sql (str):
            Raw SQL query string to execute.

    Returns:
        list[dict]:
            Query results converted into dictionaries.

            Example:
                [
                    {
                        "id": 1,
                        "name": "John"
                    }
                ]

            If an error occurs, returns:
                [
                    {
                        "error": "<error_message>"
                    }
                ]

    Notes:
        - Uses `asyncpg` for asynchronous PostgreSQL access.
        - Assumes `db_pool` has already been initialized during app startup.
        - Errors are logged for debugging and monitoring.

    Raises:
        Exception:
            Exceptions are caught internally and returned as error payloads.
    """

    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql)
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[SQL ERROR] {e}")
        return [{"error": str(e)}]


# startup() (DB pool init)
db_pool = None


@app.on_event("startup")
async def startup():
    """
    Initialize application resources during FastAPI startup.

    This startup hook performs the following tasks:

    1. Creates a PostgreSQL connection pool using `asyncpg`
    2. Stores the pool in the global `db_pool`
    3. Loads Retrieval-Augmented Generation (RAG) document chunks
       and embeddings into memory

    Environment Variables:
        DATABASE_URL:
            PostgreSQL connection string.

    Connection Pool Settings:
        - SSL enabled
        - Minimum pool size: 2
        - Maximum pool size: 10

    Returns:
        None

    Logs:
        - Emits a log message when the database pool is connected.
    """

    from rag import load_chunks

    global db_pool
    db_pool = await asyncpg.create_pool(
        os.environ.get("DATABASE_URL"), ssl="require", min_size=2, max_size=10
    )
    logger.info("Database pool connected")
    await connect_redis()
    await load_chunks()


redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST"),
    port=os.getenv("REDIS_PORT"),
    decode_responses=os.getenv("DECODE_RESPONSES"),
    socket_connect_timeout=5,
    socket_timeout=5,
    retry_on_timeout=os.getenv("RETRY_ON_TIMEOUT"),
)


async def connect_redis():
    """
    Initialize Redis connection.
    """

    try:
        await redis_client.ping()
        logger.info("✅ Redis connected")

    except Exception as e:
        logger.error(f"❌ Redis connection failed: {e}")
        raise


async def close_redis():
    """
    Close Redis connection cleanly.
    """

    await redis_client.close()

    logger.info("🛑 Redis connection closed")


# shutdown() (DB close)
@app.on_event("shutdown")
async def shutdown():
    """
    Gracefully close application resources during shutdown.

    This shutdown hook closes the PostgreSQL connection pool if it exists,
    ensuring all database connections are released properly.

    Returns:
        None
    """

    if db_pool:
        await db_pool.close()

    await close_redis()


app_with_middleware = app

import api.routes
