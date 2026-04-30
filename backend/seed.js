const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

async function seed() {
  const SQL = await initSqlJs();
  const db  = new SQL.Database();

  // ── SCHEMA ───────────────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE dim_reporting_period (
      period_id   TEXT PRIMARY KEY,
      label       TEXT,
      year        INTEGER,
      quarter     INTEGER,
      start_date  TEXT,
      end_date    TEXT
    );
  `);

  db.run(`
    CREATE TABLE mart_bhi_brand_scores (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id       TEXT,
      brand_name      TEXT,
      segment_type    TEXT,   -- 'Role' | 'Province' | 'National'
      segment_value   TEXT,   -- 'Budtender' | 'Consumer' | 'Store Manager' | 'Ontario' | 'BC' | 'AB' | 'All'
      familiarity     REAL,
      awareness       REAL,
      trial           REAL,
      sentiment       REAL,
      recommendation  REAL,
      nps             REAL,
      bhi_composite   REAL,
      sample_n        INTEGER
    );
  `);

  db.run(`
    CREATE TABLE mart_bhi_awareness_detail (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id     TEXT,
      brand_name    TEXT,
      segment_type  TEXT,
      segment_value TEXT,
      prompted      REAL,
      unprompted    REAL,
      sample_n      INTEGER
    );
  `);

  db.run(`
    CREATE TABLE mart_cohort_benchmarks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id     TEXT,
      segment_type  TEXT,
      segment_value TEXT,
      index_name    TEXT,
      index_score   REAL,
      national_avg  REAL,
      sample_n      INTEGER
    );
  `);

  db.run(`
    CREATE TABLE mart_user_scores (
      user_id         TEXT PRIMARY KEY,
      role            TEXT,
      province        TEXT,
      knowledge_level TEXT,
      consumption_type TEXT,
      purchase_freq   TEXT,
      recommendation_score REAL,
      trial_intent    REAL,
      brand_trust     REAL,
      rep_engagement  TEXT,
      platform_nps    REAL,
      employer_support TEXT,
      archetype       TEXT
    );
  `);

  db.run(`
    CREATE TABLE dim_questions (
      question_id     TEXT PRIMARY KEY,
      question_text   TEXT,
      domain          TEXT,   -- Plant | Market/Brand | Platform | Professional Development | Customer Interaction
      index_name      TEXT,
      strategic_importance INTEGER  -- 1-5
    );
  `);

  db.run(`
    CREATE TABLE fct_survey_responses (
      response_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       TEXT,
      question_id   TEXT,
      response_date TEXT,
      response_value TEXT,
      period_id     TEXT
    );
  `);

  db.run(`
    CREATE TABLE mart_nps_scores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      period_id     TEXT,
      segment_type  TEXT,
      segment_value TEXT,
      nps_type      TEXT,   -- 'platform' | 'brand'
      brand_name    TEXT,
      nps_score     REAL,
      promoters_pct REAL,
      passives_pct  REAL,
      detractors_pct REAL,
      sample_n      INTEGER
    );
  `);

  // ── SEED DATA ─────────────────────────────────────────────────────────────

  // Reporting periods
  const periods = [
    ['RP_2025_Q1', '2025 Q1', 2025, 1, '2025-01-01', '2025-03-31'],
    ['RP_2025_Q2', '2025 Q2', 2025, 2, '2025-04-01', '2025-06-30'],
    ['RP_2025_Q3', '2025 Q3', 2025, 3, '2025-07-01', '2025-09-30'],
    ['RP_2025_Q4', '2025 Q4', 2025, 4, '2025-10-01', '2025-12-31'],
    ['RP_2026_Q1', '2026 Q1', 2026, 1, '2026-01-01', '2026-03-31'],
    ['RP_2026_Q2', '2026 Q2', 2026, 2, '2026-04-01', '2026-06-30'],
  ];
  const pStmt = db.prepare('INSERT INTO dim_reporting_period VALUES (?,?,?,?,?,?)');
  periods.forEach(r => pStmt.run(r));
  pStmt.free();

  // Brands
  const brands = ['FIGR', 'Tweed', 'San Rafael', 'Redecan', 'Pure Sunfarms',
                  'Organigram', 'Broken Coast', 'Original Stash'];

  // BHI brand scores — multiple periods, segments
  const segments = [
    ['National', 'All'],
    ['Role', 'Budtender'],
    ['Role', 'Consumer'],
    ['Role', 'Store Manager'],
    ['Province', 'Ontario'],
    ['Province', 'BC'],
    ['Province', 'AB'],
  ];

  const bhiStmt = db.prepare(`
    INSERT INTO mart_bhi_brand_scores
    (period_id,brand_name,segment_type,segment_value,familiarity,awareness,trial,sentiment,recommendation,nps,bhi_composite,sample_n)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  // Seed scores — FIGR is the hero brand so give it strong numbers
  const baseScores = {
    FIGR:           { f:78, aw:82, t:61, s:74, r:68, n:42 },
    Tweed:          { f:85, aw:88, t:72, s:65, r:60, n:28 },
    'San Rafael':   { f:62, aw:67, t:48, s:70, r:58, n:35 },
    Redecan:        { f:71, aw:74, t:65, s:68, r:63, n:30 },
    'Pure Sunfarms':{ f:66, aw:70, t:55, s:72, r:66, n:38 },
    Organigram:     { f:58, aw:62, t:44, s:63, r:52, n:22 },
    'Broken Coast': { f:55, aw:60, t:42, s:69, r:55, n:31 },
    'Original Stash':{ f:60, aw:64, t:50, s:62, r:49, n:18 },
  };

  const rnd = (base, spread=8) => Math.round((base + (Math.random()-0.5)*spread) * 10) / 10;

  periods.forEach(([pid]) => {
    brands.forEach(brand => {
      const b = baseScores[brand];
      segments.forEach(([sType, sVal]) => {
        const segMod = sType === 'Role' && sVal === 'Budtender' ? 3 :
                       sType === 'Role' && sVal === 'Store Manager' ? -2 : 0;
        const f  = rnd(b.f  + segMod);
        const aw = rnd(b.aw + segMod);
        const t  = rnd(b.t  + segMod);
        const s  = rnd(b.s  + segMod);
        const r  = rnd(b.r  + segMod);
        const n  = rnd(b.n  + segMod);
        const composite = Math.round(((f + aw + t + s + r) / 5) * 10) / 10;
        const sampleN = Math.floor(80 + Math.random() * 120);
        bhiStmt.run([pid, brand, sType, sVal, f, aw, t, s, r, n, composite, sampleN]);
      });
    });
  });
  bhiStmt.free();

  // Awareness detail
  const awStmt = db.prepare(`
    INSERT INTO mart_bhi_awareness_detail
    (period_id,brand_name,segment_type,segment_value,prompted,unprompted,sample_n)
    VALUES (?,?,?,?,?,?,?)
  `);
  periods.forEach(([pid]) => {
    brands.forEach(brand => {
      segments.forEach(([sType, sVal]) => {
        const b = baseScores[brand];
        awStmt.run([pid, brand, sType, sVal, rnd(b.aw), rnd(b.aw - 20), Math.floor(80+Math.random()*120)]);
      });
    });
  });
  awStmt.free();

  // Cohort benchmarks
  const indices = ['Brand Trust', 'Choice Friction', 'Trial Intent', 'Rep Engagement',
                   'Employer Support', 'Product Knowledge', 'Recommendation Confidence', 'Platform Advocacy'];
  const cbStmt = db.prepare(`
    INSERT INTO mart_cohort_benchmarks
    (period_id,segment_type,segment_value,index_name,index_score,national_avg,sample_n)
    VALUES (?,?,?,?,?,?,?)
  `);
  const indexBase = {
    'Brand Trust': 68, 'Choice Friction': 42, 'Trial Intent': 58,
    'Rep Engagement': 55, 'Employer Support': 50, 'Product Knowledge': 72,
    'Recommendation Confidence': 63, 'Platform Advocacy': 47,
  };
  periods.forEach(([pid]) => {
    segments.forEach(([sType, sVal]) => {
      indices.forEach(idx => {
        const base = indexBase[idx];
        const segMod = sVal === 'Budtender' ? 5 : sVal === 'Store Manager' ? -3 :
                       sVal === 'Ontario' ? 2 : sVal === 'BC' ? 4 : sVal === 'AB' ? -1 : 0;
        cbStmt.run([pid, sType, sVal, idx, rnd(base+segMod), rnd(base), Math.floor(60+Math.random()*100)]);
      });
    });
  });
  cbStmt.free();

  // Questions
  const questions = [
    ['Q_B001', 'How likely are you to recommend this brand to a colleague?', 'Market/Brand', 'Recommendation Confidence', 5],
    ['Q_B002', 'How familiar are you with this brand?', 'Market/Brand', 'Brand Trust', 4],
    ['Q_B003', 'Have you tried this brand in the last 90 days?', 'Market/Brand', 'Trial Intent', 5],
    ['Q_B004', 'How would you rate the flavour profile of this product?', 'Plant', 'Product Knowledge', 3],
    ['Q_B005', 'How often do brand reps visit your store?', 'Customer Interaction', 'Rep Engagement', 4],
    ['Q_B006', 'Does your employer support your ongoing cannabis education?', 'Professional Development', 'Employer Support', 4],
    ['Q_B007', 'How confident are you explaining terpene profiles to customers?', 'Plant', 'Product Knowledge', 3],
    ['Q_B008', 'How useful is the BTA platform for your daily work?', 'Platform', 'Platform Advocacy', 3],
    ['Q_B009', 'How likely are you to try a new brand in the next 30 days?', 'Market/Brand', 'Trial Intent', 5],
    ['Q_B010', 'Rate your overall trust in this brand', 'Market/Brand', 'Brand Trust', 5],
    ['Q_B011', 'How often do you engage with educational modules on BTA?', 'Platform', 'Platform Advocacy', 3],
    ['Q_B012', 'How easy is it to choose between competing brands at point of sale?', 'Market/Brand', 'Choice Friction', 4],
    ['Q_B013', 'How well does this brand align with your store values?', 'Customer Interaction', 'Brand Trust', 3],
    ['Q_B014', 'How satisfied are you with brand marketing materials?', 'Market/Brand', 'Brand Trust', 2],
    ['Q_B015', 'How frequently do you complete professional development courses?', 'Professional Development', 'Employer Support', 4],
  ];
  const qStmt = db.prepare('INSERT INTO dim_questions VALUES (?,?,?,?,?)');
  questions.forEach(q => qStmt.run(q));
  qStmt.free();

  // Users
  const roles      = ['Budtender', 'Consumer', 'Store Manager'];
  const provinces  = ['Ontario', 'BC', 'AB'];
  const knowledge  = ['Beginner', 'Intermediate', 'Advanced'];
  const conTypes   = ['Flower', 'Vape', 'Edibles', 'Concentrates', 'Mixed'];
  const purchFreq  = ['Daily', 'Weekly', 'Monthly', 'Occasionally'];
  const repEng     = ['High', 'Medium', 'Low', 'None'];
  const empSupport = ['Strong', 'Moderate', 'Weak', 'None'];
  const archetypes = ['Brand Ambassador', 'Knowledge Seeker', 'Casual Explorer', 'Deal Driven'];

  const users = [];
  for (let i = 1; i <= 300; i++) {
    const role = roles[Math.floor(Math.random() * roles.length)];
    const prov = provinces[Math.floor(Math.random() * provinces.length)];
    const kl   = knowledge[Math.floor(Math.random() * knowledge.length)];
    const ct   = conTypes[Math.floor(Math.random() * conTypes.length)];
    const pf   = purchFreq[Math.floor(Math.random() * purchFreq.length)];
    const re   = repEng[Math.floor(Math.random() * repEng.length)];
    const es   = empSupport[Math.floor(Math.random() * empSupport.length)];
    const at   = archetypes[Math.floor(Math.random() * archetypes.length)];
    const rec  = rnd(role === 'Budtender' ? 68 : 55);
    const tri  = rnd(60);
    const bt   = rnd(65);
    const nps  = rnd(45);
    users.push([`U${String(i).padStart(4,'0')}`, role, prov, kl, ct, pf, rec, tri, bt, re, nps, es, at]);
  }
  const uStmt = db.prepare('INSERT INTO mart_user_scores VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  users.forEach(u => uStmt.run(u));
  uStmt.free();

  // Survey responses — some questions intentionally sparse for gap detection
  const sparseQuestions = ['Q_B008', 'Q_B011', 'Q_B013', 'Q_B014', 'Q_B015'];
  const rStmt = db.prepare('INSERT INTO fct_survey_responses (user_id,question_id,response_date,response_value,period_id) VALUES (?,?,?,?,?)');

  users.forEach(u => {
    questions.forEach(([qid]) => {
      const isSparse = sparseQuestions.includes(qid);
      if (isSparse && Math.random() > 0.2) return; // only 20% respond to sparse Qs
      if (!isSparse && Math.random() > 0.75) return;
      const pid = periods[Math.floor(Math.random() * periods.length)][0];
      const date = `2025-${String(Math.floor(1+Math.random()*11)).padStart(2,'0')}-${String(Math.floor(1+Math.random()*27)).padStart(2,'0')}`;
      const val  = String(Math.floor(1 + Math.random() * 5));
      rStmt.run([u[0], qid, date, val, pid]);
    });
  });
  rStmt.free();

  // NPS scores
  const npsStmt = db.prepare(`
    INSERT INTO mart_nps_scores (period_id,segment_type,segment_value,nps_type,brand_name,nps_score,promoters_pct,passives_pct,detractors_pct,sample_n)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);
  periods.forEach(([pid]) => {
    // Platform NPS
    segments.forEach(([sType, sVal]) => {
      const score = rnd(45);
      const pro = rnd(55); const pas = rnd(25); const det = 100 - pro - pas;
      npsStmt.run([pid, sType, sVal, 'platform', null, score, pro, pas, Math.max(det,0), Math.floor(60+Math.random()*80)]);
    });
    // Brand NPS
    brands.forEach(brand => {
      const b = baseScores[brand];
      const score = rnd(b.n);
      const pro = rnd(50); const pas = rnd(28); const det = 100 - pro - pas;
      npsStmt.run([pid, 'National', 'All', 'brand', brand, score, pro, pas, Math.max(det,0), Math.floor(60+Math.random()*100)]);
    });
  });
  npsStmt.free();

  // ── EXPORT ───────────────────────────────────────────────────────────────
  const data = db.export();
  const buf  = Buffer.from(data);
  const outPath = path.join(__dirname, 'bta_mock.db');
  fs.writeFileSync(outPath, buf);
  console.log(`✓ Database created at ${outPath}`);

  // Print row counts
  const tables = ['dim_reporting_period','mart_bhi_brand_scores','mart_bhi_awareness_detail',
                  'mart_cohort_benchmarks','mart_user_scores','dim_questions',
                  'fct_survey_responses','mart_nps_scores'];
  tables.forEach(t => {
    const [{values}] = db.exec(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${values[0][0]} rows`);
  });

  db.close();
}

seed().catch(console.error);
