import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from db.client import redis_client
import json


# run_kmeans()
async def run_kmeans(n_clusters: int = 4):
    from db.client import run_query

    """
        Run K-Means clustering on user score data to identify audience segments.

        Fetches user analytics data from PostgreSQL, transforms score indexes
        into feature vectors, normalizes the data, and groups users into
        clusters using K-Means.

        Args:
            n_clusters (int, optional):
                Number of clusters to generate. Defaults to 4.

        Returns:
            list[dict] | dict:
                Cluster summaries containing:
                    - cluster id
                    - cluster size
                    - top user roles
                    - top provinces
                    - average feature scores

                Returns an error dictionary if no data is available.
    """

    #  CACHE KEY (depends on cluster config)
    cache_key = f"kmeans:{n_clusters}"

    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    rows = await run_query("""
        SELECT u.user_key, u.bta_user_role, u.province, u.gender,
               s.index_name, s.score_value
        FROM analytics_gold.mart_user_scores s
        JOIN analytics_marts.dim_users u ON s.user_key = u.user_key
        WHERE u.user_status = 'approved' LIMIT 1000;
    """)
    if isinstance(rows, dict):
        return rows
    if not rows:
        return {"error": "No user data"}

    # FEATURE ENGINEERING
    df = pd.DataFrame(rows)

    pivot = df.pivot_table(
        index="user_key",
        columns="index_name",
        values="score_value",
        aggfunc="mean",
    )

    pivot = pivot.fillna(pivot.mean(numeric_only=True))
    X = SimpleImputer(strategy="mean").fit_transform(pivot.values)

    X_scaled = StandardScaler().fit_transform(X)

    clusters = KMeans(n_clusters=n_clusters, random_state=42, n_init=10).fit_predict(
        X_scaled
    )

    pivot["cluster"] = clusters

    # METADATA JOIN
    meta = df.drop_duplicates("user_key").set_index("user_key")[
        ["bta_user_role", "province", "gender"]
    ]

    result = pivot.join(meta)

    # SUMMARY BUILD
    summary = []

    for c in range(n_clusters):
        grp = result[result["cluster"] == c]

        feature_means = (
            grp.drop(
                columns=["cluster", "bta_user_role", "province", "gender"],
                errors="ignore",
            )
            .mean()
            .to_dict()
        )

        summary.append(
            {
                "cluster": c,
                "size": int(len(grp)),
                "top_roles": (
                    grp["bta_user_role"].value_counts().to_dict()
                    if "bta_user_role" in grp
                    else {}
                ),
                "top_provinces": (
                    grp["province"].value_counts().head(3).to_dict()
                    if "province" in grp
                    else {}
                ),
                "avg_scores": {
                    k: round(float(v), 2)
                    for k, v in feature_means.items()
                    if not pd.isna(v)
                },
            }
        )

    # 🔥 CACHE RESULT
    await redis_client.set(
        cache_key,
        json.dumps(summary),
        ex=3600,  # 1 hour cache
    )

    return summary
