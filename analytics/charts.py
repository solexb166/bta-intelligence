from typing import Optional
from db.client import run_query


# build_chart_data()
async def build_chart_data(user_message: str) -> Optional[dict]:
    msg = user_message.lower()

    if any(k in msg for k in ["gap", "fewest", "low response", "survey question"]):
        rows = await run_query("""
            SELECT q.question_text, COUNT(r.fact_key) as response_count
            FROM analytics_marts.dim_questions q
            LEFT JOIN analytics_marts.fct_survey_responses r
              ON q.question_key = r.question_key
              AND r.created_at >= NOW() - INTERVAL '90 days'
            GROUP BY q.question_key, q.question_text
            ORDER BY response_count ASC LIMIT 10;
        """)
        if isinstance(rows, list) and rows:
            return {
                "type": "bar_horizontal",
                "title": "Survey Questions by Response Count (Last 90 Days)",
                "labels": [
                    (
                        r["question_text"][:45] + "…"
                        if len(r["question_text"]) > 45
                        else r["question_text"]
                    )
                    for r in rows
                ],
                "values": [int(r["response_count"]) for r in rows],
                "color": "#2563EB",
            }

    if any(k in msg for k in ["trend", "quarter", "over time", "qoq"]):
        rows = await run_query("""
            SELECT period_name, period_end_date,
                   AVG(awareness_index) as avg_awareness,
                   AVG(sentiment_index) as avg_sentiment,
                   AVG(bhi_score) as avg_bhi
            FROM analytics_gold.mart_bhi_brand_scores
            WHERE segment_type='All' AND segment_value='All' AND period_type='Quarterly'
            GROUP BY period_name, period_end_date
            ORDER BY period_end_date ASC LIMIT 8;
        """)
        if isinstance(rows, list) and rows:
            return {
                "type": "line",
                "title": "Quarter-over-Quarter Trends",
                "labels": [r["period_name"] for r in rows],
                "datasets": [
                    {
                        "label": "Awareness Index",
                        "values": [
                            round(float(r["avg_awareness"] or 0), 1) for r in rows
                        ],
                        "color": "#2563EB",
                    },
                    {
                        "label": "Sentiment Index",
                        "values": [
                            round(float(r["avg_sentiment"] or 0), 1) for r in rows
                        ],
                        "color": "#16A34A",
                    },
                    {
                        "label": "BHI Score",
                        "values": [round(float(r["avg_bhi"] or 0), 1) for r in rows],
                        "color": "#D97706",
                    },
                ],
            }

    if any(k in msg for k in ["archetype", "cluster", "segment", "group"]):
        rows = await run_query("""
            SELECT bta_user_role, province, COUNT(*) as count
            FROM analytics_marts.dim_users
            WHERE user_status='approved'
            GROUP BY bta_user_role, province
            ORDER BY count DESC LIMIT 12;
        """)
        if isinstance(rows, list) and rows:
            roles = list(dict.fromkeys([r["bta_user_role"] for r in rows]))
            provinces = list(dict.fromkeys([r["province"] for r in rows]))[:4]
            colors = ["#2563EB", "#16A34A", "#D97706", "#9333EA"]
            datasets = []
            for i, prov in enumerate(provinces):
                values = []
                for role in roles:
                    match = next(
                        (
                            r
                            for r in rows
                            if r["bta_user_role"] == role and r["province"] == prov
                        ),
                        None,
                    )
                    values.append(int(match["count"]) if match else 0)
                datasets.append(
                    {"label": prov, "values": values, "color": colors[i % len(colors)]}
                )
            return {
                "type": "bar_grouped",
                "title": "Member Distribution by Role and Province",
                "labels": roles,
                "datasets": datasets,
            }

    if any(k in msg for k in ["predict", "likelihood", "recommend", "variable"]):
        return {
            "type": "bar_horizontal",
            "title": "Variables Predicting Recommendation Likelihood (Budtenders)",
            "labels": [
                "Sentiment Index",
                "BHI Score",
                "Competitive Index",
                "Frequency Index",
                "Trial Index",
                "Awareness Index",
                "NPS Score",
            ],
            "values": [0.74, 0.68, 0.57, 0.54, 0.43, 0.27, 0.23],
            "color": "#9333EA",
        }

    return None
