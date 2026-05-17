import json, re
from typing import List
from ai_providers.ai_service import AIService
from db.client import run_query
from db.schema import SCHEMA
from ml.clustering import run_kmeans
from analytics.charts import build_chart_data

ai_service = AIService()


# run_agent()
async def run_agent(user_message: str, history: list) -> tuple:
    from rag.service import search_docs

    """
    Process a user request using AI, database querying, clustering,
    and Retrieval-Augmented Generation (RAG).

    This function acts as the main orchestration layer for the
    BTA Intelligence assistant.

    Workflow:
        1. Detect whether clustering analysis is needed
        2. Retrieve relevant document excerpts using semantic search
        3. Build a system prompt with schema + document context
        4. Generate an AI response
        5. Extract SQL queries from the response
        6. Execute SQL queries against PostgreSQL
        7. Feed database results back into the AI for interpretation
        8. Generate chart-ready analytics data

    Args:
        user_message (str):
            The user's natural language question or request.

        history (list):
            Previous chat conversation history.

            Example:
                [
                    {
                        "role": "user",
                        "content": "What are top-performing brands?"
                    }
                ]

    Returns:
        tuple:
            (
                final_response_text: str,
                chart_data: dict | list | None
            )

            - final_response_text:
                AI-generated response with interpreted insights.

            - chart_data:
                Structured chart visualization data generated from
                the user's query.

    Features:
        - SQL generation and execution
        - RAG document retrieval
        - K-means clustering integration
        - Multi-step AI reasoning loop
        - Automatic chart generation

    Notes:
        - The AI may generate multiple SQL queries.
        - SQL execution results are appended back into the prompt
          for final narrative interpretation.
        - The loop is capped at 6 iterations to prevent infinite cycles.
    """

    clustering_data = None

    if any(
        kw in user_message.lower()
        for kw in ["archetype", "cluster", "segment", "group member", "group users"]
    ):
        clustering_data = await run_kmeans()

    doc_results = await search_docs(user_message)

    doc_context = ""
    if doc_results:
        doc_context = "\n\n".join(
            [f"[From {r['source']}]: {r['text']}" for r in doc_results]
        )

    system_prompt = build_system_prompt(doc_context)

    context_parts = [
        system_prompt,
        "\nPREVIOUS CHAT HISTORY:\n",
        json.dumps(history or [], indent=2),
    ]

    if clustering_data:
        context_parts.append(
            "\nPRE-COMPUTED CLUSTERS:\n" + json.dumps(clustering_data, indent=2)
        )

    current_msg = "\n\nUSER QUESTION:\n" + user_message + "\n\n"

    full_prompt = "\n".join(context_parts) + current_msg

    final_text = ""

    for _ in range(6):
        response_text = await ai_service.generate(full_prompt)

        sql_blocks = extract_sql(response_text)

        if not sql_blocks:
            final_text = re.sub(
                r"<sql>[\s\S]*?</sql>",
                "",
                response_text,
                flags=re.IGNORECASE,
            ).strip()
            break

        query_results = ""

        for sql in sql_blocks:
            rows = await run_query(sql)

            query_results += (
                f"\nSQL:\n{sql}\n" f"RESULTS:\n{json.dumps(rows[:30], default=str)}\n"
            )

        # FIX: accumulate instead of reset
        full_prompt += (
            "\n\nDATABASE RESULTS:\n"
            + query_results
            + "\n\nNow write final answer in plain prose only."
        )

    chart_data = await build_chart_data(user_message)

    return (final_text or response_text, chart_data)


# extract_sql()
def extract_sql(text: str) -> List[str]:
    """
    Extract SQL queries embedded inside <sql> tags.

    This utility parses AI-generated responses and returns all SQL
    statements wrapped in the following format:

        <sql>
        SELECT * FROM table;
        </sql>

    Args:
        text (str):
            AI-generated text containing embedded SQL blocks.

    Returns:
        List[str]:
            A list of extracted SQL query strings.

    Example:
        Input:
            '''
            <sql>
            SELECT * FROM users;
            </sql>
            '''

        Output:
            [
                "SELECT * FROM users;"
            ]

    Notes:
        - Matching is case-insensitive.
        - Supports multiline SQL queries.
        - Returns an empty list if no SQL blocks are found.
    """

    return [
        m.group(1).strip()
        for m in re.finditer(r"<sql>([\s\S]*?)</sql>", text, re.IGNORECASE)
    ]


# build_system_prompt()


def build_system_prompt(doc_context: str = "") -> str:
    """
    Construct the master AI system prompt.

    This prompt defines:
        - The assistant's role and behavior
        - SQL generation rules
        - Database schema access
        - RAG document usage
        - Output formatting constraints
        - Analytical expectations

    Args:
        doc_context (str, optional):
            Retrieved document excerpts from the RAG system.

            Example:
                "[From report.pdf]: Consumer sentiment increased..."

    Returns:
        str:
            Fully formatted system prompt string supplied to the AI model.

    Prompt Includes:
        - PostgreSQL schema definition
        - RAG context
        - Strict answer formatting instructions
        - SQL response requirements
        - Analytical interpretation guidance

    Notes:
        - The AI is instructed to never fabricate data.
        - SQL queries must use only approved schema columns.
        - Responses are constrained to concise prose.
    """

    rag_section = (
        f"\nRELEVANT DOCUMENT EXCERPTS:\n{doc_context}\n" if doc_context else ""
    )
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


# extract_sql()
def extract_sql(text: str) -> List[str]:
    """
    Extract SQL queries embedded inside <sql> tags.

    This utility parses AI-generated responses and returns all SQL
    statements wrapped in the following format:

        <sql>
        SELECT * FROM table;
        </sql>

    Args:
        text (str):
            AI-generated text containing embedded SQL blocks.

    Returns:
        List[str]:
            A list of extracted SQL query strings.

    Example:
        Input:
            '''
            <sql>
            SELECT * FROM users;
            </sql>
            '''

        Output:
            [
                "SELECT * FROM users;"
            ]

    Notes:
        - Matching is case-insensitive.
        - Supports multiline SQL queries.
        - Returns an empty list if no SQL blocks are found.
    """

    return [
        m.group(1).strip()
        for m in re.finditer(r"<sql>([\s\S]*?)</sql>", text, re.IGNORECASE)
    ]


# build_system_prompt()
def build_system_prompt(doc_context: str = "") -> str:
    """
    Construct the master AI system prompt.

    This prompt defines:
        - The assistant's role and behavior
        - SQL generation rules
        - Database schema access
        - RAG document usage
        - Output formatting constraints
        - Analytical expectations

    Args:
        doc_context (str, optional):
            Retrieved document excerpts from the RAG system.

            Example:
                "[From report.pdf]: Consumer sentiment increased..."

    Returns:
        str:
            Fully formatted system prompt string supplied to the AI model.

    Prompt Includes:
        - PostgreSQL schema definition
        - RAG context
        - Strict answer formatting instructions
        - SQL response requirements
        - Analytical interpretation guidance

    Notes:
        - The AI is instructed to never fabricate data.
        - SQL queries must use only approved schema columns.
        - Responses are constrained to concise prose.
    """

    rag_section = (
        f"\nRELEVANT DOCUMENT EXCERPTS:\n{doc_context}\n" if doc_context else ""
    )
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
