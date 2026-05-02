require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

// ── Accurate schema from real database ─────────────────────────────────────
const SCHEMA = `
REAL DATABASE SCHEMA (use EXACTLY these table names and column names):

analytics_gold.mart_bhi_brand_scores
  score_key, brand_key, brand_name, brand_code, period_id, period_type, period_name,
  period_end_date, segment_type, segment_value, sample_size, total_respondents,
  bhi_score, delta_prev_period, ski_index, epi_index, ati_index, csi_index,
  awareness_index, tom_pct, unaided_pct, aided_pct, familiarity_index, trial_index,
  nps_index, nps_score, promoter_pct, passive_pct, detractor_pct,
  nps_meets_n_threshold, sentiment_index, frequency_index, competitive_index, dbt_updated_at
  NOTE: segment_type values are 'All', 'Role', 'Province', 'Age Group'
  NOTE: segment_value for national = 'All' (segment_type='All')
  NOTE: segment_value for roles = 'Budtender', 'Store Manager', 'Consumer'
  NOTE: segment_value for provinces = 'ON', 'BC', 'AB', 'SK', 'NB'
  NOTE: period_type values = 'Monthly', 'Quarterly', 'Global'
  NOTE: latest quarterly period = 'Q2 2026', latest monthly = 'April 2026'

analytics_gold.mart_cohort_benchmarks
  benchmark_key, period_id, index_name, cohort_dimension, cohort_value,
  avg_score, median_score, stddev_score, sample_size, delta_prev_period, dbt_updated_at

analytics_gold.mart_user_scores
  score_key, user_key, period_id, index_name, score_value,
  input_questions, calc_date, dbt_updated_at

analytics_gold.dim_reporting_period
  period_key, period_id, period_label, year, quarter, start_date, end_date

analytics_gold.mart_bhi_awareness_detail
  score_key, brand_key, brand_name, period_id, period_type, period_name,
  period_end_date, segment_type, segment_value, awareness_index,
  tom_pct, unaided_pct, aided_pct, sample_size, dbt_updated_at

analytics_gold.mart_nps_scores
  (same structure as mart_bhi_brand_scores, focused on NPS metrics)

analytics_marts.dim_users
  user_key, user_id, bta_user_role, province, country, gender,
  age_years, user_status, created_at, dbt_updated_at
  NOTE: user_status = 'approved' for active members
  NOTE: bta_user_role values = 'Budtender', 'Store Manager', 'Consumer'

analytics_marts.dim_brands
  brand_key, brand_id, brand_name, brand_code, brand_category, dbt_updated_at

analytics_marts.dim_questions
  question_key, question_id, question_text, response_type, scale_used,
  mapped_dimension, ethics_sensitivity, dbt_updated_at

analytics_marts.dim_surveys
  survey_key, survey_id, survey_name, survey_type, dbt_updated_at

analytics_marts.fct_survey_responses
  fact_key, response_id, user_key, survey_key, survey_id, question_key,
  question_id, question_text, answer, question_type, brand_name,
  reward_points, created_at, is_mapped, type, dbt_updated_at

analytics_marts.fct_bhi_brand_evaluations
  evaluation_key, user_key, brand_key, period_key, is_unaided_recalled,
  familiarity, trial, purchase_frequency, sentiment, recommendation,
  created_at, dbt_updated_at

EXAMPLE QUERIES:
-- Top 5 brands by BHI score latest quarter:
SELECT brand_name, bhi_score, sample_size, period_name, awareness_index, sentiment_index, nps_score
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type = 'All' AND segment_value = 'All' AND period_type = 'Quarterly'
ORDER BY period_end_date DESC, bhi_score DESC NULLS LAST LIMIT 10;

-- Quarter over quarter trend:
SELECT brand_name, period_name, period_end_date, awareness_index, sentiment_index, trial_index, bhi_score, delta_prev_period
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type = 'All' AND segment_value = 'All' AND period_type = 'Quarterly'
ORDER BY brand_name, period_end_date ASC LIMIT 40;

-- Survey gap detection:
SELECT q.question_text, q.mapped_dimension, COUNT(r.fact_key) as response_count
FROM analytics_marts.dim_questions q
LEFT JOIN analytics_marts.fct_survey_responses r ON q.question_key = r.question_key
AND r.created_at >= NOW() - INTERVAL '90 days'
GROUP BY q.question_key, q.question_text, q.mapped_dimension
ORDER BY response_count ASC LIMIT 20;

-- User demographics for archetypes:
SELECT bta_user_role, province, gender, COUNT(*) as count
FROM analytics_marts.dim_users
WHERE user_status = 'approved'
GROUP BY bta_user_role, province, gender ORDER BY count DESC LIMIT 30;

-- Budtender predictive:
SELECT brand_name, bhi_score, sentiment_index, familiarity_index, trial_index, awareness_index, nps_score, frequency_index, competitive_index, sample_size
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type = 'Role' AND segment_value = 'Budtender' AND period_type = 'Quarterly'
ORDER BY period_end_date DESC, bhi_score DESC LIMIT 20;
`;

function buildSystemPrompt() {
  return `You are BTA Intelligence, a senior market research analyst for the Budtenders Association (BTA).

You have access to a real PostgreSQL database. To answer any question you MUST output a SQL query in this exact format before answering:

<sql>
SELECT ... FROM schema.table WHERE ...;
</sql>

After receiving the results, write your final answer in plain prose. You may output multiple <sql> blocks if needed.

${SCHEMA}

STRICT RULES:
- Always output at least one <sql> block before answering.
- Use ONLY the exact table names and column names listed in the schema above.
- Never use column names not listed above.
- For national/overall data always use: WHERE segment_type = 'All' AND segment_value = 'All'
- For budtender data use: WHERE segment_type = 'Role' AND segment_value = 'Budtender'
- For quarterly periods use: AND period_type = 'Quarterly'
- For latest period add: ORDER BY period_end_date DESC
- Write answers in plain prose only. No bullet points, no bold text, no asterisks, no hash symbols, no markdown.
- Always cite specific numbers from the query results.
- Never fabricate data. If results are empty try a simpler query without filters.`;
}

function extractSqlBlocks(text) {
  const matches = [...text.matchAll(/<sql>([\s\S]*?)<\/sql>/gi)];
  return matches.map(m => m[1].trim());
}

async function runAgentLoop(userMessage, history) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = buildSystemPrompt();

  const geminiHistory = history
    .filter(m => m.role && m.content && typeof m.content === 'string')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I will always query the database using the exact schema provided before answering any question.' }] },
      ...geminiHistory,
    ],
  });

  let finalText = '';
  let currentMessage = userMessage;

  for (let turn = 0; turn < 6; turn++) {
    const result = await chat.sendMessage(currentMessage);
    const responseText = result.response.text();

    const sqlBlocks = extractSqlBlocks(responseText);

    if (sqlBlocks.length === 0) {
      finalText = responseText.replace(/<sql>[\s\S]*?<\/sql>/gi, '').trim();
      break;
    }

    let queryResults = '';
    for (const sql of sqlBlocks) {
      try {
        const rows = await runQuery(sql);
        console.log(`[SQL] ${sql.slice(0, 100)} -> ${rows.length} rows`);
        queryResults += `\nQuery: ${sql}\nResults (${rows.length} rows): ${JSON.stringify(rows.slice(0, 30), null, 2)}\n`;
      } catch (err) {
        console.error(`[SQL ERROR] ${err.message}`);
        queryResults += `\nQuery: ${sql}\nError: ${err.message} — try a different query with correct column names from the schema.\n`;
      }
    }

    currentMessage = `Database results:\n${queryResults}\n\nNow write your final answer in plain prose only. No SQL blocks, no bold, no bullets, no markdown formatting of any kind.`;
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

pool.connect()
  .then(c => { c.release(); console.log('Database connected'); })
  .catch(e => console.error('DB connection failed:', e.message));

app.listen(PORT, () => console.log(`BTA Intelligence API -> http://localhost:${PORT}`));
