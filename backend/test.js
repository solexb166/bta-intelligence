require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  SELECT table_schema, table_name 
  FROM information_schema.tables 
  WHERE table_schema IN ('analytics_gold','analytics_marts','api_ops')
  ORDER BY table_schema, table_name
`).then(r => {
  console.log('Tables:', r.rows);
  pool.end();
}).catch(e => {
  console.error('Error:', e.message);
  pool.end();
});