import json
from pathlib import Path
import pandas as pd


# ---------------------------------------------------------
# File locations
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

adolescent_file = BASE_DIR / "adolescent_vaccines.json"
uds_file = BASE_DIR / "uds_quality_measures.json"

output_file = BASE_DIR / "provider_quality_measures.xlsx"


# ---------------------------------------------------------
# Read JSON files
# ---------------------------------------------------------

with open(adolescent_file, "r", encoding="utf-8") as f:
    adolescent_data = json.load(f)

with open(uds_file, "r", encoding="utf-8") as f:
    uds_data = json.load(f)


# ---------------------------------------------------------
# Build provider data
# ---------------------------------------------------------

providers = {}

# Adolescent vaccine measures
for provider_key, provider_data in adolescent_data.get("providers", {}).items():
    provider_name = provider_data.get("name", provider_key)

    providers.setdefault(provider_name, {
        "Provider": provider_name
    })

    for measure, value in provider_data.get("measures", {}).items():
        providers[provider_name][measure] = value


# UDS quality measures
for provider_key, provider_data in uds_data.get("providers", {}).items():
    provider_name = provider_data.get("name", provider_key)

    providers.setdefault(provider_name, {
        "Provider": provider_name
    })

    for measure, value in provider_data.get("measures", {}).items():

        # Prefix UDS measures so that a measure with the same name
        # in both files does not overwrite the other value.
        column_name = f"UDS - {measure}"

        providers[provider_name][column_name] = value


# ---------------------------------------------------------
# Create DataFrame
# ---------------------------------------------------------

df = pd.DataFrame(providers.values())

# Sort alphabetically by provider
df = df.sort_values("Provider").reset_index(drop=True)


# ---------------------------------------------------------
# Write Excel
# ---------------------------------------------------------

with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
    df.to_excel(
        writer,
        sheet_name="Provider Measures",
        index=False
    )

    worksheet = writer.sheets["Provider Measures"]

    # Freeze header row and provider column
    worksheet.freeze_panes = "B2"

    # Format percentage columns
    for column in worksheet.iter_cols(min_row=2):
        header = column[0].column_letter

        if column[0].value != "Provider":
            for cell in column:
                cell.number_format = "0.00%"

    # Adjust column widths
    for column_cells in worksheet.columns:
        max_length = 0
        column_letter = column_cells[0].column_letter

        for cell in column_cells:
            if cell.value is not None:
                max_length = max(max_length, len(str(cell.value)))

        worksheet.column_dimensions[column_letter].width = min(
            max_length + 2,
            40
        )


print(f"Excel file created: {output_file}")