require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Gemini client ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── PostgreSQL connection ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runQuery(sql) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// ── Schema loader ──────────────────────────────────────────────────────────
let schemaDescription = '';

async function loadSchema() {
  try {
    const rows = await runQuery(`
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema IN ('analytics_gold', 'analytics_marts', 'api_ops')
      ORDER BY table_schema, table_name, ordinal_position;
    `);
    const tables = {};
    rows.forEach(({ table_schema, table_name, column_name, data_type }) => {
      const key = `${table_schema}.${table_name}`;
      if (!tables[key]) tables[key] = [];
      tables[key].push(`${column_name} (${data_type})`);
    });
    schemaDescription = Object.entries(tables)
      .map(([name, cols]) => `TABLE: ${name}\n  ${cols.join(', ')}`)
      .join('\n\n');
    console.log('Schema loaded:', Object.keys(tables).join(', '));
  } catch (err) {
    console.error('Schema load failed:', err.message);
    schemaDescription = '(schema unavailable)';
  }
}

// ── System prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real PostgreSQL database. To answer any question, you MUST first retrieve data by outputting a SQL query in this exact format:

<sql>
SELECT ... FROM schema.table WHERE ...;
</sql>

After you see the query results, write your final answer in plain prose.

DATABASE SCHEMA:
${schemaDescription}

RULES:
- Always output a <sql> block before answering any data question.
- You may output multiple <sql> blocks if needed.
- Always prefix table names with schema: analytics_gold.table_name or analytics_marts.table_name
- Write in plain prose only. No bullet points, no markdown headings, no asterisks, no hash symbols.
- Always cite specific numbers from the query results.
- Never fabricate data.
- Use ILIKE for case-insensitive text matching.
- Limit SQL results to 20 rows unless more are needed.`;
}

// ── SQL extraction helper ──────────────────────────────────────────────────
function extractSqlBlocks(text) {
  const matches = [...text.matchAll(/<sql>([\s\S]*?)<\/sql>/gi)];
  return matches.map(m => m[1].trim());
}

// ── Agentic loop using Gemini ──────────────────────────────────────────────
async function runAgentLoop(userMessage, history) {
 const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const systemPrompt = buildSystemPrompt();

  // Build chat history for Gemini
  const geminiHistory = history
    .filter(m => m.role && m.content && typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I am BTA Intelligence. I will always query the database before answering.' }] },
      ...geminiHistory,
    ],
  });

  let finalText = '';
  let currentMessage = userMessage;

  for (let turn = 0; turn < 8; turn++) {
    const result = await chat.sendMessage(currentMessage);
    const responseText = result.response.text();

    const sqlBlocks = extractSqlBlocks(responseText);

    if (sqlBlocks.length === 0) {
      // No SQL — this is the final answer
      finalText = responseText.replace(/<sql>[\s\S]*?<\/sql>/gi, '').trim();
      break;
    }

    // Execute all SQL blocks and collect results
    let queryResults = '';
    for (const sql of sqlBlocks) {
      try {
        const rows = await runQuery(sql);
        console.log(`[SQL] ${sql.slice(0, 100)} -> ${rows.length} rows`);
        queryResults += `\nQuery: ${sql}\nResults: ${JSON.stringify(rows.slice(0, 50), null, 2)}\n`;
      } catch (err) {
        console.error(`[SQL ERROR] ${err.message}`);
        queryResults += `\nQuery: ${sql}\nError: ${err.message}\n`;
      }
    }

    // Feed results back and ask for final answer
    currentMessage = `Here are the database query results:\n${queryResults}\n\nNow write your final answer in plain prose based on these results. Do not output any more SQL blocks.`;
  }

  return finalText || 'No answer generated.';
}

// ── POST /chat ─────────────────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message (string) is required' });
  }
  try {
    const reply = await runAgentLoop(message, history);
    res.json({ reply });
  } catch (err) {
    console.error('[/chat error]', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'BTA Intelligence API' }));

loadSchema().then(() => {
  app.listen(PORT, () => console.log(`BTA Intelligence API -> http://localhost:${PORT}`));
});
