require('dotenv').config({ path: __dirname + '/.env' });
const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool }  = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Anthropic client ───────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── PostgreSQL connection ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Run query and return rows ──────────────────────────────────────────────
async function runQuery(sql) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// ── Get all table names from the real DB ───────────────────────────────────
async function getSchema() {
  const rows = await runQuery(`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema IN ('analytics_gold', 'analytics_marts', 'api_ops')
    ORDER BY table_name, ordinal_position;
  `);
  const tables = {};
  rows.forEach(({ table_schema, table_name, column_name, data_type }) => {
    if (!tables[`${table_schema}.${table_name}`]) tables[`${table_schema}.${table_name}`] = [];
    tables[`${table_schema}.${table_name}`].push(`${column_name} (${data_type})`);
  });
  return tables;
}

let schemaDescription = '';

async function loadSchema() {
  try {
    const tables = await getSchema();
    const lines = Object.entries(tables).map(([name, cols]) =>
      `TABLE: ${name}\n  ${cols.join(', ')}`
    );
    schemaDescription = lines.join('\n\n');
    console.log('Schema loaded:', Object.keys(tables).join(', '));
  } catch (err) {
    console.error('Schema load failed:', err.message);
    schemaDescription = '(schema unavailable)';
  }
}

// ── System prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real PostgreSQL database via the query_database tool. ALWAYS query the database before answering — never guess or invent numbers.

DATABASE SCHEMA:
${schemaDescription}

RESPONSE RULES:
- Write in plain prose only. No bullet points, no markdown headings, no asterisks, no hash symbols.
- Use short paragraphs to separate ideas.
- Always cite specific numbers, percentages, and sample sizes from the query results.
- When comparing periods, include both values and the delta.
- Acknowledge sample size limitations where relevant.
- If a query returns no data, explain what filters were used and suggest alternatives.
- Never fabricate data.

TOOL USE RULES:
- Always call query_database before writing your answer.
- You may call it multiple times for complex questions.
- Write clean valid PostgreSQL SQL.
- Limit results to 20 rows unless more are needed.
- Always prefix table names with their schema: analytics_gold.table_name, analytics_marts.table_name, or api_ops.table_name.
- Limit results to 20 rows unless more are needed.
- Use ILIKE for case-insensitive text matching.`;
}

// ── Tool definition ────────────────────────────────────────────────────────
const tools = [
  {
    name: 'query_database',
    description: 'Run a SELECT query against the real BTA PostgreSQL database and return results as JSON.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A valid PostgreSQL SELECT statement.' },
      },
      required: ['sql'],
    },
  },
];

// ── Agentic loop ───────────────────────────────────────────────────────────
async function runAgentLoop(userMessage, history) {
  const messages = [
    ...history.filter(m => m.role && m.content),
    { role: 'user', content: userMessage },
  ];

  let finalText = '';

  for (let turn = 0; turn < 8; turn++) {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system:     buildSystemPrompt(),
      tools,
      messages,
    });

    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length) finalText = textBlocks.map(b => b.text).join('\n');

    if (response.stop_reason === 'end_turn') break;

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (!toolUses.length) break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = await Promise.all(toolUses.map(async tu => {
      let result;
      try {
        const rows = await runQuery(tu.input.sql);
        result = JSON.stringify(rows.slice(0, 50), null, 2);
        console.log(`[SQL] ${tu.input.sql.slice(0, 100)} -> ${rows.length} rows`);
      } catch (err) {
        result = JSON.stringify({ error: err.message });
        console.error(`[SQL ERROR] ${err.message}`);
      }
      return { type: 'tool_result', tool_use_id: tu.id, content: result };
    }));

    messages.push({ role: 'user', content: toolResults });
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

// ── Health check ───────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'BTA Intelligence API' }));

// ── Start ──────────────────────────────────────────────────────────────────
loadSchema().then(() => {
  app.listen(PORT, () => console.log(`BTA Intelligence API -> http://localhost:${PORT}`));
});
