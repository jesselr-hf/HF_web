import duckdb
import json
from pathlib import Path

HERE = Path(__file__).parent.resolve()
BASE_DIR = HERE
QUERY_FILE = BASE_DIR / "query.sql"
OUTPUT_FILE = BASE_DIR / "static" / "stats.json"

provider_user_map = {
    "Cheryl Pimentel-Costa": "cpimentelcosta",
    "Daniel Simoneau": "dsimoneau",
    "Gloria Mercado": "gmercado",
    "James Hodson": "jhodson",
    "Kathryn Collins": "kcollins",
    "Katie Tavares Medeiros": "ktavaresmedeiros",
    "Kevin Harkins": "kharkins",
    "Laura Cardenas-Ramos": "lcardenasramos",
    "Laura Leydon": "lleydon",
    "Leeann Orluk": "lorluk",
    "Lynn Taylor": "ltaylor",
    "Mohit Ojha": "mojha",
    "Molly O'Brien": "mobrien",
    "Sabine Schmitt": "sschmitt",
    "Whitney I. Lee Rocha": "wleerocha"
}

def safe_number(value):
    if value is None:
        return 0
    return value


def safe_percent(part, whole):
    part = safe_number(part)
    whole = safe_number(whole)

    if whole == 0:
        return 0

    return round((part / whole) * 100, 1)


def safe_json(value, default):
    if value is None:
        return default

    if value == "":
        return default

    return json.loads(value)


def main():
    print("Starting script...")

    conn = duckdb.connect(database=":memory:")

    with open(QUERY_FILE, "r", encoding="utf-8") as file:
        sql_script = file.read()

    result = conn.execute(sql_script).fetchone()
    columns = [desc[0] for desc in conn.description]

    row = dict(zip(columns, result))

    data = {
        "depression_count": safe_number(row["depression_count"]),
        "diabetics_count": safe_number(row["diabetics_count"]),
        "htn_count": safe_number(row["htn_count"]),
        "obesity_count": safe_number(row["obesity_count"]),
        "total_count": safe_number(row["total_count"]),

        "age_0_2_count": safe_number(row["age_0_2"]),
        "age_3_12_count": safe_number(row["age_3_12"]),
        "age_13_17_count": safe_number(row["age_13_17"]),
        "age_18_54_count": safe_number(row["age_18_54"]),
        "age_55_64_count": safe_number(row["age_55_64"]),
        "age_65_plus_count": safe_number(row["age_65_plus"]),

        "english_count": safe_number(row["english_count"]),
        "haitian_creole_count": safe_number(row["haitian_creole_count"]),
        "khmer_count": safe_number(row["khmer_count"]),
        "other_language_count": safe_number(row["other_language_count"]),
        "portuguese_count": safe_number(row["portuguese_count"]),
        "spanish_count": safe_number(row["spanish_count"]),

        "panel_rows": safe_json(row["panel_rows_json"], []),
        "patients": safe_json(row["patients_json"], []),
        "pcp_list": safe_json(row["pcp_list"], []),

        "pcp_visits": safe_json(row["pcp_visits_json"], []),

        "provider_last_fill_summary": safe_json(row["provider_last_fill_summary_json"], []),
        "provider_next_fill_summary": safe_json(row["provider_next_fill_summary_json"], []),

        "center_last_fill": safe_json(row["center_last_fill_json"], {}),
        "center_next_fill": safe_json(row["center_next_fill_json"], {})
    }

    data["depression_percentage"] = safe_percent(data["depression_count"], data["total_count"])
    data["diabetics_percentage"] = safe_percent(data["diabetics_count"], data["total_count"])
    data["htn_percentage"] = safe_percent(data["htn_count"], data["total_count"])
    data["obesity_percentage"] = safe_percent(data["obesity_count"], data["total_count"])

    total_age = (
        data["age_0_2_count"] +
        data["age_3_12_count"] +
        data["age_13_17_count"] +
        data["age_18_54_count"] +
        data["age_55_64_count"] +
        data["age_65_plus_count"]
    )

    data["total_age_count"] = total_age
    data["age_0_2_percentage"] = safe_percent(data["age_0_2_count"], total_age)
    data["age_3_12_percentage"] = safe_percent(data["age_3_12_count"], total_age)
    data["age_13_17_percentage"] = safe_percent(data["age_13_17_count"], total_age)
    data["age_18_54_percentage"] = safe_percent(data["age_18_54_count"], total_age)
    data["age_55_64_percentage"] = safe_percent(data["age_55_64_count"], total_age)
    data["age_65_plus_percentage"] = safe_percent(data["age_65_plus_count"], total_age)

    total_language = (
        data["english_count"] +
        data["haitian_creole_count"] +
        data["khmer_count"] +
        data["other_language_count"] +
        data["portuguese_count"] +
        data["spanish_count"]
    )

    data["total_language_count"] = total_language
    data["english_percentage"] = safe_percent(data["english_count"], total_language)
    data["haitian_creole_percentage"] = safe_percent(data["haitian_creole_count"], total_language)
    data["khmer_percentage"] = safe_percent(data["khmer_count"], total_language)
    data["other_language_percentage"] = safe_percent(data["other_language_count"], total_language)
    data["portuguese_percentage"] = safe_percent(data["portuguese_count"], total_language)
    data["spanish_percentage"] = safe_percent(data["spanish_count"], total_language)




    data["provider_user_map"] = provider_user_map
    # data["authorized_users"] = authorized_users

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, separators=(",", ":"))

    print(f"Wrote {OUTPUT_FILE}")
    print("Done.")