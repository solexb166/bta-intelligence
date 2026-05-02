require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    const r1 = await client.query(`
      SELECT DISTINCT segment_type, segment_value, period_type
      FROM analytics_gold.mart_bhi_brand_scores
      LIMIT 20;
    `);
    console.log('Segments:', JSON.stringify(r1.rows, null, 2));

    const r2 = await client.query(`
      SELECT DISTINCT period_type, period_name, period_end_date
      FROM analytics_gold.mart_bhi_brand_scores
      ORDER BY period_end_date DESC
      LIMIT 10;
    `);
    console.log('Periods:', JSON.stringify(r2.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}
check().catch(console.error);