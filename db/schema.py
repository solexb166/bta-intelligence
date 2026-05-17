SCHEMA = """
REAL DATABASE SCHEMA — use ONLY these exact table and column names:

analytics_gold.mart_bhi_brand_scores
  brand_name, bhi_score, period_type ('Monthly'|'Quarterly'|'Global'),
  period_name, period_end_date,
  segment_type ('All'|'Role'|'Province'|'Age Group'),
  segment_value ('All' for national | 'Budtender'|'Store Manager'|'Consumer' for roles | 'ON'|'BC'|'AB' for provinces),
  awareness_index, familiarity_index, trial_index, sentiment_index,
  nps_score, frequency_index, competitive_index, sample_size, delta_prev_period

analytics_gold.mart_cohort_benchmarks
  period_id, index_name, cohort_dimension, cohort_value,
  avg_score, median_score, sample_size, delta_prev_period

analytics_gold.mart_user_scores
  user_key, period_id, index_name, score_value, calc_date

analytics_marts.dim_users
  user_key, bta_user_role, province, country, gender, age_years, user_status

analytics_marts.dim_questions
  question_key, question_text, response_type, mapped_dimension

analytics_marts.fct_survey_responses
  fact_key, user_key, question_key, question_text, answer, brand_name, created_at

EXAMPLE QUERIES:
-- Top brands:
SELECT brand_name, bhi_score, sample_size, period_name, awareness_index, sentiment_index, nps_score
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
ORDER BY period_end_date DESC, bhi_score DESC NULLS LAST LIMIT 10;

-- Trend:
SELECT brand_name, period_name, period_end_date, awareness_index, bhi_score, delta_prev_period
FROM analytics_gold.mart_bhi_brand_scores
WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
ORDER BY brand_name, period_end_date ASC LIMIT 40;

-- Gap detection:
SELECT q.question_text, q.mapped_dimension, COUNT(r.fact_key) as response_count
FROM analytics_marts.dim_questions q
LEFT JOIN analytics_marts.fct_survey_responses r
  ON q.question_key=r.question_key AND r.created_at >= NOW() - INTERVAL '90 days'
GROUP BY q.question_key, q.question_text, q.mapped_dimension
ORDER BY response_count ASC LIMIT 20;
"""
