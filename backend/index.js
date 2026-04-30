require('dotenv').config({ path: __dirname + '/.env' });
const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let db;
async function loadDb() {
  const SQL     = await initSqlJs();
  const dbPath  = path.join(__dirname, 'bta_mock.db');
  const filebuf = fs.readFileSync(dbPath);
  db = new SQL.Database(filebuf);
  console.log('BTA mock database loaded');
}

function runQuery(sql) {
  try {
    const results = db.exec(sql);
    if (!results.length) return [];
    const { columns, values } = results[0];
    return values.map(row =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    );
  } catch (err) {
    throw new Error(`SQL Error: ${err.message} | Query: ${sql}`);
  }
}

const SCHEMA = `
TABLE: dim_reporting_period
  period_id TEXT PK (e.g. RP_2026_Q2 = latest), label, year INT, quarter INT, start_date, end_date

TABLE: mart_bhi_brand_scores
  period_id, brand_name, segment_type (National|Role|Province),
  segment_value (All|Budtender|Consumer|Store Manager|Ontario|BC|AB),
  familiarity, awareness, trial, sentiment, recommendation, nps, bhi_composite REAL, sample_n INT

TABLE: mart_bhi_awareness_detail
  period_id, brand_name, segment_type, segment_value, prompted REAL, unprompted REAL, sample_n INT

TABLE: mart_cohort_benchmarks
  period_id, segment_type, segment_value,
  index_name (Brand Trust|Choice Friction|Trial Intent|Rep Engagement|Employer Support|Product Knowledge|Recommendation Confidence|Platform Advocacy),
  index_score REAL, national_avg REAL, sample_n INT

TABLE: mart_user_scores
  user_id TEXT PK, role, province, knowledge_level, consumption_type, purchase_freq,
  recommendation_score, trial_intent, brand_trust, rep_engagement,
  platform_nps REAL, employer_support, archetype TEXT

TABLE: dim_questions
  question_id TEXT PK, question_text, domain (Plant|Market/Brand|Platform|Professional Development|Customer Interaction),
  index_name, strategic_importance INT (1-5)

TABLE: fct_survey_responses
  response_id INT PK, user_id, question_id, response_date, response_value, period_id

TABLE: mart_nps_scores
  period_id, segment_type, segment_value, nps_type (platform|brand), brand_name,
  nps_score, promoters_pct, passives_pct, detractors_pct REAL, sample_n INT

NOTES: Latest period is RP_2026_Q2. Always filter by segment_type and segment_value when comparing roles or provinces.
`;

function buildSystemPrompt() {
  return `You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real SQLite database via the query_database tool. ALWAYS query the database to answer questions — never guess or invent numbers.

${SCHEMA}

RESPONSE RULES:
- Write in plain prose only. No bullet points, no markdown headings, no asterisks, no hash symbols.
- Use short paragraphs to separate ideas.
- State specific numbers and percentages from the query results.
- When comparing periods, always include both values and the delta.
- Acknowledge sample size limitations where relevant.
- If a query returns no data, explain what filters were used and suggest alternatives.
- Never fabricate data.

TOOL USE RULES:
- Always call query_database before writing your answer.
- You may call it multiple times for complex questions.
- Write clean valid SQLite SQL. Limit results to 20 rows unless more are needed.`;
}

const tools = [
  {
    name: 'query_database',
    description: 'Run a SELECT query against the BTA SQLite database and return results as JSON.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'A valid SQLite SELECT statement.' },
      },
      required: ['sql'],
    },
  },
];

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

    const toolResults = toolUses.map(tu => {
      let result;
      try {
        const rows = runQuery(tu.input.sql);
        result = JSON.stringify(rows.slice(0, 50), null, 2);
        console.log(`[SQL] ${tu.input.sql.slice(0, 100)} -> ${rows.length} rows`);
      } catch (err) {
        result = JSON.stringify({ error: err.message });
        console.error(`[SQL ERROR] ${err.message}`);
      }
      return { type: 'tool_result', tool_use_id: tu.id, content: result };
    });

    messages.push({ role: 'user', content: toolResults });
  }

  return finalText || 'No answer generated.';
}

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

loadDb().then(() => {
  app.listen(PORT, () => console.log(`BTA Intelligence API -> http://localhost:${PORT}`));
}).catch(err => { console.error('DB load failed:', err.message); process.exit(1); });
