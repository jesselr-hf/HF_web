PRAGMA memory_limit='4GB';
PRAGMA threads=4;

CREATE OR REPLACE TEMP TABLE TotalPop AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/TotalPop.csv');

CREATE OR REPLACE TEMP TABLE PtPanels AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/PtPanels.csv');

CREATE OR REPLACE TEMP TABLE Obese AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/Obese.csv');

CREATE OR REPLACE TEMP TABLE Diabetics AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/Diabetics.csv');

CREATE OR REPLACE TEMP TABLE Depression AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/Depression.csv');

CREATE OR REPLACE TEMP TABLE HTN AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/HTN.csv');

CREATE OR REPLACE TEMP TABLE PCPVisits AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/visitsytd.csv');

CREATE OR REPLACE TEMP TABLE ProviderFillRate AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/ProviderFillRate.csv');

CREATE OR REPLACE TEMP TABLE ProviderNextFillRate AS
SELECT *
FROM read_csv_auto('//hfvdcfs/Data Analytics/Jesse/web/reports/pophealth/data/appointmentND.csv');


CREATE OR REPLACE TEMP TABLE TotalPop_Clean AS
SELECT DISTINCT
    CAST(PAT_ID AS VARCHAR) AS pat_id
FROM TotalPop
WHERE PAT_ID IS NOT NULL;


CREATE OR REPLACE TEMP TABLE PtPanels_Clean AS
SELECT DISTINCT
    CAST(PAT_ID AS VARCHAR) AS pat_id,
    CAST(MRN AS VARCHAR) AS mrn,

    COALESCE(NULLIF(TRIM(CAST(PCP AS VARCHAR)), ''), 'Unassigned') AS pcp,

    CASE
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('0-2', '0to2', '0_2') THEN '0-2'
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('3-12', '3to12', '3_12') THEN '3-12'
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('13-17', '13to17', '13_17') THEN '13-17'
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('18-54', '18to54', '18_54') THEN '18-54'
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('55-64', '55to64', '55_64') THEN '55-64'
        WHEN REPLACE(REPLACE(TRIM(COALESCE(CAST("Age Group" AS VARCHAR), 'Unknown')), ' ', ''), ',', '') IN ('65+', '65plus') THEN '65+'
        ELSE 'Unknown'
    END AS age_group,

    CASE
        WHEN LOWER(TRIM(COALESCE(CAST(Language AS VARCHAR), 'Unknown'))) IN ('english', 'eng') THEN 'English'
        WHEN LOWER(TRIM(COALESCE(CAST(Language AS VARCHAR), 'Unknown'))) IN ('haitian creole', 'haitian-creole', 'haitian_creole', 'creole') THEN 'Haitian Creole'
        WHEN LOWER(TRIM(COALESCE(CAST(Language AS VARCHAR), 'Unknown'))) IN ('spanish', 'esp', 'espanol', 'español') THEN 'Spanish'
        WHEN LOWER(TRIM(COALESCE(CAST(Language AS VARCHAR), 'Unknown'))) IN ('portuguese', 'portugues', 'português') THEN 'Portuguese'
        WHEN LOWER(TRIM(COALESCE(CAST(Language AS VARCHAR), 'Unknown'))) IN ('khmer', 'cambodian') THEN 'Khmer'
        WHEN TRIM(COALESCE(CAST(Language AS VARCHAR), '')) = '' THEN 'Unknown'
        ELSE 'Other'
    END AS language

FROM PtPanels
WHERE PAT_ID IS NOT NULL;


CREATE OR REPLACE TEMP TABLE PCPVisits_Clean AS
SELECT
    COALESCE(NULLIF(TRIM(CAST(EXTERNAL_NAME AS VARCHAR)), ''), 'Unassigned') AS pcp,
    SUM(
        COALESCE(
            TRY_CAST(REPLACE(CAST(NUM_VISITS_YTD AS VARCHAR), ',', '') AS DOUBLE),
            0
        )
    ) AS num_visits_ytd
FROM PCPVisits
GROUP BY pcp;


CREATE OR REPLACE TEMP TABLE ProviderFillRate_Clean AS
SELECT
    COALESCE(NULLIF(TRIM(CAST("Department" AS VARCHAR)), ''), 'Unknown') AS department,
    COALESCE(NULLIF(TRIM(CAST("Provider" AS VARCHAR)), ''), 'Unassigned') AS pcp,

    CAST(
        COALESCE(
            TRY_STRPTIME(CAST("Date" AS VARCHAR), '%m/%d/%Y'),
            TRY_STRPTIME(CAST("Date" AS VARCHAR), '%Y-%m-%d')
        )
        AS DATE
    ) AS fill_date,

    COALESCE(
        TRY_CAST(REPLACE(CAST("Filled" AS VARCHAR), ',', '') AS DOUBLE),
        0
    ) AS filled_count,

    COALESCE(
        TRY_CAST(REPLACE(CAST("Total" AS VARCHAR), ',', '') AS DOUBLE),
        0
    ) AS total_slots

FROM ProviderFillRate
WHERE "Provider" IS NOT NULL;


CREATE OR REPLACE TEMP TABLE ProviderNextFillRate_Clean AS
SELECT
    COALESCE(NULLIF(TRIM(CAST("Provider" AS VARCHAR)), ''), 'Unassigned') AS pcp,

    CASE
        WHEN COALESCE(
            TRY_CAST(
                REPLACE(REPLACE(CAST("Future Fill Rate" AS VARCHAR), '%', ''), ',', '')
                AS DOUBLE
            ),
            0
        ) > 1
        THEN ROUND(
            COALESCE(
                TRY_CAST(
                    REPLACE(REPLACE(CAST("Future Fill Rate" AS VARCHAR), '%', ''), ',', '')
                    AS DOUBLE
                ),
                0
            ) / 100,
            4
        )
        ELSE ROUND(
            COALESCE(
                TRY_CAST(
                    REPLACE(REPLACE(CAST("Future Fill Rate" AS VARCHAR), '%', ''), ',', '')
                    AS DOUBLE
                ),
                0
            ),
            4
        )
    END AS future_fill_rate

FROM ProviderNextFillRate
WHERE "Provider" IS NOT NULL;


CREATE OR REPLACE TEMP TABLE ProviderLastFill_Summary AS
WITH RankedLastFill AS (
    SELECT
        pcp,
        fill_date,
        filled_count,
        total_slots,
        ROW_NUMBER() OVER (
            PARTITION BY pcp
            ORDER BY fill_date DESC
        ) AS rn
    FROM ProviderFillRate_Clean
    WHERE fill_date IS NOT NULL
)
SELECT
    pcp,
    MAX(fill_date) AS fill_date,
    SUM(filled_count) AS filled,
    SUM(total_slots) AS total,
    CASE
        WHEN SUM(total_slots) = 0 THEN 0
        ELSE ROUND(SUM(filled_count) / SUM(total_slots), 4)
    END AS fill_rate
FROM RankedLastFill
WHERE rn = 1
GROUP BY pcp;


CREATE OR REPLACE TEMP TABLE ProviderNextFill_Summary AS
SELECT
    pcp,
    NULL AS fill_date,
    0 AS filled,
    0 AS total,
    ROUND(AVG(future_fill_rate), 4) AS fill_rate
FROM ProviderNextFillRate_Clean
GROUP BY pcp;


CREATE OR REPLACE TEMP TABLE Population_With_Demographics AS
SELECT
    p.pat_id,
    COALESCE(p.mrn, '') AS mrn,
    COALESCE(p.pcp, 'Unassigned') AS pcp,
    COALESCE(p.age_group, 'Unknown') AS age_group,
    COALESCE(p.language, 'Unknown') AS language
FROM PtPanels_Clean p;
-- Removed TotalPop due to improper population to use as main driver
-- LEFT JOIN TotalPop_Clean t 
--     ON p.pat_id = t.pat_id;


CREATE OR REPLACE TEMP TABLE Obese_Clean AS
SELECT DISTINCT CAST(PAT_ID AS VARCHAR) AS pat_id
FROM Obese
WHERE PAT_ID IS NOT NULL;

CREATE OR REPLACE TEMP TABLE Diabetics_Clean AS
SELECT DISTINCT CAST(PAT_ID AS VARCHAR) AS pat_id
FROM Diabetics
WHERE PAT_ID IS NOT NULL;

CREATE OR REPLACE TEMP TABLE Depression_Clean AS
SELECT DISTINCT CAST(PAT_ID AS VARCHAR) AS pat_id
FROM Depression
WHERE PAT_ID IS NOT NULL;

CREATE OR REPLACE TEMP TABLE HTN_Clean AS
SELECT DISTINCT CAST(PAT_ID AS VARCHAR) AS pat_id
FROM HTN
WHERE PAT_ID IS NOT NULL;


CREATE OR REPLACE TEMP TABLE Patients_With_Conditions AS
SELECT
    p.pat_id,
    p.mrn,
    p.pcp,
    p.age_group,
    p.language,

    CASE WHEN d.pat_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_diabetes,
    CASE WHEN h.pat_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_htn,
    CASE WHEN o.pat_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_obesity,
    CASE WHEN dep.pat_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_depression

FROM Population_With_Demographics p
LEFT JOIN Diabetics_Clean d ON p.pat_id = d.pat_id
LEFT JOIN HTN_Clean h ON p.pat_id = h.pat_id
LEFT JOIN Obese_Clean o ON p.pat_id = o.pat_id
LEFT JOIN Depression_Clean dep ON p.pat_id = dep.pat_id;


CREATE OR REPLACE TEMP TABLE Panel_Rows AS
SELECT
    pcp,
    age_group AS "Age Group",
    language AS Language,
    COUNT(*) AS panel_count
FROM Patients_With_Conditions
GROUP BY pcp, age_group, language;


SELECT
    COUNT(*) AS total_count,

    SUM(CASE WHEN has_depression THEN 1 ELSE 0 END) AS depression_count,
    SUM(CASE WHEN has_diabetes THEN 1 ELSE 0 END) AS diabetics_count,
    SUM(CASE WHEN has_htn THEN 1 ELSE 0 END) AS htn_count,
    SUM(CASE WHEN has_obesity THEN 1 ELSE 0 END) AS obesity_count,

    SUM(CASE WHEN age_group = '0-2' THEN 1 ELSE 0 END) AS age_0_2,
    SUM(CASE WHEN age_group = '3-12' THEN 1 ELSE 0 END) AS age_3_12,
    SUM(CASE WHEN age_group = '13-17' THEN 1 ELSE 0 END) AS age_13_17,
    SUM(CASE WHEN age_group = '18-54' THEN 1 ELSE 0 END) AS age_18_54,
    SUM(CASE WHEN age_group = '55-64' THEN 1 ELSE 0 END) AS age_55_64,
    SUM(CASE WHEN age_group = '65+' THEN 1 ELSE 0 END) AS age_65_plus,

    SUM(CASE WHEN language = 'English' THEN 1 ELSE 0 END) AS english_count,
    SUM(CASE WHEN language = 'Haitian Creole' THEN 1 ELSE 0 END) AS haitian_creole_count,
    SUM(CASE WHEN language = 'Khmer' THEN 1 ELSE 0 END) AS khmer_count,
    SUM(CASE WHEN language = 'Other' THEN 1 ELSE 0 END) AS other_language_count,
    SUM(CASE WHEN language = 'Portuguese' THEN 1 ELSE 0 END) AS portuguese_count,
    SUM(CASE WHEN language = 'Spanish' THEN 1 ELSE 0 END) AS spanish_count,

    (
        SELECT COALESCE(
            json_group_array(
                json_object(
                    'pcp', pcp,
                    'age_group', "Age Group",
                    'language', Language,
                    'panel_count', panel_count
                )
            ),
            '[]'
        )
        FROM Panel_Rows
    ) AS panel_rows_json,

    (
        SELECT COALESCE(
            json_group_array(
                json_object(
                    'pat_id', pat_id,
                    'mrn', mrn,
                    'pcp', pcp,
                    'age_group', age_group,
                    'language', language,
                    'has_diabetes', has_diabetes,
                    'has_htn', has_htn,
                    'has_obesity', has_obesity,
                    'has_depression', has_depression
                )
            ),
            '[]'
        )
        FROM Patients_With_Conditions
    ) AS patients_json,

    (
        SELECT COALESCE(
            json_group_array(pcp),
            '[]'
        )
        FROM (
            SELECT DISTINCT pcp
            FROM Patients_With_Conditions
            WHERE pcp IS NOT NULL
              AND pcp NOT IN ('', 'Unknown', 'Unassigned', 'Inactive/Transferred')
            ORDER BY pcp
        )
    ) AS pcp_list,

    (
        SELECT COALESCE(
            json_group_array(
                json_object(
                    'pcp', pcp,
                    'num_visits_ytd', num_visits_ytd
                )
            ),
            '[]'
        )
        FROM PCPVisits_Clean
    ) AS pcp_visits_json,

    (
        SELECT COALESCE(
            json_group_array(
                json_object(
                    'pcp', pcp,
                    'date', CAST(fill_date AS VARCHAR),
                    'filled', filled,
                    'total', total,
                    'fill_rate', fill_rate
                )
            ),
            '[]'
        )
        FROM ProviderLastFill_Summary
    ) AS provider_last_fill_summary_json,

    (
        SELECT COALESCE(
            json_group_array(
                json_object(
                    'pcp', pcp,
                    'date', NULL,
                    'filled', filled,
                    'total', total,
                    'fill_rate', fill_rate
                )
            ),
            '[]'
        )
        FROM ProviderNextFill_Summary
    ) AS provider_next_fill_summary_json,

    (
        SELECT COALESCE(
            json_object(
                'date', CAST(MAX(fill_date) AS VARCHAR),
                'filled', SUM(filled),
                'total', SUM(total),
                'fill_rate',
                    CASE
                        WHEN SUM(total) = 0 THEN 0
                        ELSE ROUND(SUM(filled) / SUM(total), 4)
                    END
            ),
            '{}'
        )
        FROM ProviderLastFill_Summary
    ) AS center_last_fill_json,

    (
        SELECT COALESCE(
            json_object(
                'date', NULL,
                'filled', 0,
                'total', 0,
                'fill_rate',
                    CASE
                        WHEN AVG(fill_rate) IS NULL THEN 0
                        ELSE ROUND(AVG(fill_rate), 4)
                    END
            ),
            '{}'
        )
        FROM ProviderNextFill_Summary
    ) AS center_next_fill_json

FROM Patients_With_Conditions;