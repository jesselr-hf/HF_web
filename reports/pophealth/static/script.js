Promise.all([
    fetch(`stats.json?t=${Date.now()}`).then(response => {
        if (!response.ok) {
            throw new Error("Could not load stats.json");
        }
        return response.json();
    }),

    fetch(`/pophealth/data/uds_quality_measures.json?t=${Date.now()}`).then(response => {
        if (!response.ok) {
            throw new Error("Could not load uds_quality_measures.json");
        }
        return response.json();
    }),

    fetch(`/pophealth/data/adolescent_vaccines.json?t=${Date.now()}`).then(response => {
        if (!response.ok) {
            throw new Error("Could not load adolescent_vaccines.json");
        }
        return response.json();
    }).catch(error => {
        console.error("Adolescent vaccines data unavailable:", error);
        return { current_year: null, clinic: {}, providers: {} };
    })
])
.then(([data, udsData, adolescentVaccinesData]) => {
    console.log("Loaded stats:", data);
    console.log("Loaded UDS data:", udsData);
    console.log("Loaded adolescent vaccines data:", adolescentVaccinesData);

        if (window.ChartDataLabels) {
            Chart.register(ChartDataLabels);
        }

        let tabCount = 1;
        let isSyncingFilterControls = false;

        const tabStates = {};

        const siteSelect = document.getElementById("site");
        const ageSelect = document.getElementById("age");
        const conditionSelect = document.getElementById("condition");
        const languageSelect = document.getElementById("language");
        const refreshButton = document.querySelector(".header-button");
        const resetFilterButton = document.getElementById("reset-filter");
        const applySidebarFiltersButton = document.getElementById("apply-sidebar-filters");

        let allPatients = data.patients || [];
        let allPcpVisits = data.pcp_visits || [];
        let providerLastFillSummary = data.provider_last_fill_summary || [];
        let providerNextFillSummary = data.provider_next_fill_summary || [];
        let centerLastFill = data.center_last_fill || {};
        let centerNextFill = data.center_next_fill || {};
        let authorizedUsers = data.authorized_users || {};
        let providerUserMap = data.provider_user_map || {};

        if (!Array.isArray(allPatients)) allPatients = [allPatients];
        if (!Array.isArray(allPcpVisits)) allPcpVisits = [allPcpVisits];
        if (!Array.isArray(providerLastFillSummary)) providerLastFillSummary = [providerLastFillSummary];
        if (!Array.isArray(providerNextFillSummary)) providerNextFillSummary = [providerNextFillSummary];

        function safeNumber(value) {
            if (value === null || value === undefined || value === "") {
                return 0;
            }

            const cleaned = String(value).replaceAll(",", "").replace("%", "");
            return Number(cleaned) || 0;
        }

        function cleanUsername(value) {
            return String(value || "")
                .trim()
                .toLowerCase()
                .replace(/^.*\\/, "")
                .replace(/^.*\//, "")
                .replace(/@.*$/, "");
        }

        function getDisplayNameFromUsername(username) {
            const cleanedUsername = cleanUsername(username);

            const displayNameMap = {
                avenigalla: "Abhiraam Venigalla",
                pvenigalla: "Pradeep Venigalla",
                jreid: "Jesse Reid",
                egraves: "Evan Graves",
                medeirosl: "Linda Medeiros",
                ljones: "Lisa Jones",
                atgadmin: "ATG Admin",
                crichards: "Cole Richards",
                botelhom: "Micaela Botelho-Gonzaga",

                cpimentelcosta: "Cheryl Pimentel-Costa",
                dsimoneau: "Daniel Simoneau",
                gmercado: "Gloria Mercado",
                jhodson: "James Hodson",
                kcollins: "Kathryn Collins",
                ktavaresmedeiros: "Katie Tavares Medeiros",
                kharkins: "Kevin Harkins",
                lcardenasramos: "Laura Cardenas-Ramos",
                lleydon: "Laura Leydon",
                lorluk: "Leeann Orluk",
                ltaylor: "Lynn Taylor",
                mojha: "Mohit Ojha",
                mobrien: "Molly O'Brien",
                sschmitt: "Sabine Schmitt",
                wleerocha: "Whitney I. Lee Rocha"
            };

            console.log("getDisplayNameFromUsername input:", username);
            console.log("getDisplayNameFromUsername cleaned:", cleanedUsername);

            if (cleanedUsername && displayNameMap[cleanedUsername]) {
                return displayNameMap[cleanedUsername];
            }

            if (
                cleanedUsername &&
                authorizedUsers[cleanedUsername] &&
                authorizedUsers[cleanedUsername].provider_name
            ) {
                return authorizedUsers[cleanedUsername].provider_name;
            }

            if (cleanedUsername) {
                return cleanedUsername;
            }

            return "Unknown User";
        }

        function extractUsernameFromUserInfo(userInfo) {
            if (!userInfo || typeof userInfo !== "object") {
                return "";
            }

            const possibleFields = [
                userInfo.username,
                userInfo.user,
                userInfo.current_user,
                userInfo.remote_user,
                userInfo.REMOTE_USER,
                userInfo.authenticated_user,
                userInfo.login,
                userInfo.name,
                userInfo.uid,
                userInfo.cn
            ];

            for (const field of possibleFields) {
                const cleaned = cleanUsername(field);

                if (cleaned) {
                    return cleaned;
                }
            }

            return "";
        }

        function getUsernameFromPage() {
            const bodyUsername = document.body ? document.body.dataset.username : "";
            const htmlUsername = document.documentElement ? document.documentElement.dataset.username : "";
            const metaUsername = document.querySelector('meta[name="current-user"]');
            const windowUsername = window.CURRENT_USER || window.currentUser || window.username;

            if (bodyUsername) {
                return cleanUsername(bodyUsername);
            }

            if (htmlUsername) {
                return cleanUsername(htmlUsername);
            }

            if (metaUsername && metaUsername.content) {
                return cleanUsername(metaUsername.content);
            }

            if (windowUsername) {
                return cleanUsername(windowUsername);
            }

            return "";
        }

        function setProfileNameFromUsername(username) {
            const profileNameElement = document.querySelector(".profile-name");

            if (!profileNameElement) {
                return;
            }

            profileNameElement.textContent = getDisplayNameFromUsername(username);
        }

        function updateProfileUsername() {
            const profileNameElement = document.querySelector(".profile-name");

            if (!profileNameElement) {
                console.warn("No .profile-name element found.");
                return;
            }

            fetch("/pophealth/debug-user", {
                cache: "no-store",
                credentials: "same-origin"
            })
                .then(response => {
                    console.log("debug-user status:", response.status);
                    return response.text();
                })
                .then(text => {
                    console.log("debug-user raw text first 1000 chars:", text.slice(0, 1000));

                    let username = "";

                    const patterns = [
                        /X-Remote-User\s*=\s*([A-Za-z0-9._-]+)/i,
                        /X-Remote-User\s*:\s*([A-Za-z0-9._-]+)/i,
                        /X-Remote-Name\s*=\s*([A-Za-z0-9._-]+)/i,
                        /X-Remote-Name\s*:\s*([A-Za-z0-9._-]+)/i,
                        /x_remote_user["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i,
                        /x_remote_name["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i,
                        /username["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i
                    ];

                    for (const pattern of patterns) {
                        const match = text.match(pattern);

                        if (match && match[1]) {
                            username = match[1];
                            break;
                        }
                    }

                    console.log("Extracted username:", username);

                    const displayName = getDisplayNameFromUsername(username);

                    console.log("Final profile display name:", displayName);

                    profileNameElement.textContent = displayName;
                })
                .catch(error => {
                    console.error("Could not resolve profile username:", error);
                    profileNameElement.textContent = "Unknown User";
                });
        }

        function formatPercent(value) {
            const number = safeNumber(value);

            if (number <= 1) {
                return (number * 100).toFixed(1) + "%";
            }

            return number.toFixed(1) + "%";
        }

        // Start UDS


        function getUdsDataForPcp(selectedPcp) {
            // All PCPs = clinic data for the most recent three years
            if (selectedPcp === "all") {
                const currentYear = Number(udsData.current_year);

                return [currentYear - 2, currentYear - 1, currentYear]
                    .map(year => String(year))
                    .filter(year => udsData.clinic?.[year])
                    .map(year => ({
                        year: year,
                        measures: udsData.clinic[year]
                    }));
            }

            // Specific PCP = that provider's available year
            const provider = udsData.providers?.[selectedPcp];

            if (!provider) {
                return [];
            }

            return [{
                year: String(provider.year),
                measures: provider.measures || {}
            }];
        }


        function updateUdsDashboard(tabId, selectedPcp) {
            const container = document.getElementById(`${tabId}-uds-measures`);

            if (!container) {
                return;
            }

            const years = getUdsDataForPcp(selectedPcp);

            if (years.length === 0) {
                container.innerHTML = "<p class='uds-no-data'>No UDS data available.</p>";
                return;
            }

            const measureNames = [
                "Breast Cancer Screening",
                "Cervical Cancer Screening",
                "Childhood Immunization Status",
                "Colorectal Cancer Screening",
                "Controlling High Blood Pressure",
                "Dental Sealants for Children between 6 - 9 Years",
                "Depression Remission at Twelve Months",
                "Diabetes: Glycemic Status Assessment Greater Than 9%",
                "HIV Screening",
                "Initiation and Engagement of Substance Use Disorder Treatment",
                "Ischemic Vascular Disease (IVD): Use of Aspirin or Another Antiplatelet",
                "Preventive Care and Screening Body Mass Index (BMI) Screening and Follow Up Plan",
                "Preventive Care and Screening: Screening for Clinical Depression and Follow-Up Plan",
                "Preventive Care and Screening: Tobacco Use: Screening and Cessation Intervention",
                "Statin Therapy for the Prevention and Treatment of Cardiovascular Disease",
                "Substance Use Treatment - Patients With Multiple Treatment",
                "Weight Assessment and Counseling for Nutrition and Physical Activity for Children and Adolescents"
            ];

            let html = `
                <table class="uds-table">
                    <thead>
                        <tr>
                            <th>Measure</th>
                            ${years.map(item => `<th>${item.year}</th>`).join("")}
                        </tr>
                    </thead>
                    <tbody>
            `;

            measureNames.forEach(measureName => {
                html += `
                    <tr>
                        <td>${measureName}</td>
                        ${years.map(item => {
                            const value = item.measures[measureName];

                            if (value === undefined || value === null) {
                                return "<td>—</td>";
                            }

                            return `<td>${formatPercent(value)}</td>`;
                        }).join("")}
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
            `;

            container.innerHTML = html;
        }


        // End UDS


        // Start Provider Productivity


        // adolescent_vaccines.json only ever holds a single measure, so rather
        // than hardcode its exact label (and risk it drifting out of sync with
        // MEASURE_NAME in AdolescentVaccinesJSON.py), just read whichever key
        // is present.
        function getFirstMeasureValue(measuresObj) {
            if (!measuresObj) {
                return undefined;
            }

            const keys = Object.keys(measuresObj);

            if (keys.length === 0) {
                return undefined;
            }

            return measuresObj[keys[0]];
        }

        function getProductivityMetrics(selectedPcp) {
            const udsMetrics = [
                {
                    key: "Childhood Immunization Status",
                    label: "Childhood Immunization Status"
                },
                {
                    key: "Statin Therapy for the Prevention and Treatment of Cardiovascular Disease",
                    label: "Statin Therapy"
                },
                {
                    key: "Diabetes: Glycemic Status Assessment Greater Than 9%",
                    label: "Diabetes: A1c > 9%"
                }
            ].map(metric => {
                let value;

                if (selectedPcp === "all") {
                    const currentYear = String(udsData.current_year);
                    value = udsData.clinic?.[currentYear]?.[metric.key];
                } else {
                    value = udsData.providers?.[selectedPcp]?.measures?.[metric.key];
                }

                return { label: metric.label, value: value };
            });

            let adolescentValue;

            if (selectedPcp === "all") {
                const currentYear = String(adolescentVaccinesData.current_year);
                adolescentValue = getFirstMeasureValue(adolescentVaccinesData.clinic?.[currentYear]);
            } else {
                adolescentValue = getFirstMeasureValue(
                    adolescentVaccinesData.providers?.[selectedPcp]?.measures
                );
            }

            return [
                ...udsMetrics,
                { label: "Adolescent Vaccine Completion", value: adolescentValue }
            ];
        }


        function updateProviderProductivity(tabId, selectedPcp) {
            const container = document.getElementById(`${tabId}-provider-productivity`);

            if (!container) {
                return;
            }

            const metrics = getProductivityMetrics(selectedPcp);

            container.innerHTML = metrics.map(metric => {
                const displayValue =
                    metric.value === undefined || metric.value === null
                        ? "—"
                        : formatPercent(metric.value);

                return `
                    <div class="productivity-stat">
                        <div class="productivity-stat-value">${displayValue}</div>
                        <div class="productivity-stat-label">${metric.label}</div>
                    </div>
                `;
            }).join("");
        }


        // End Provider Productivity


        function calculatePercent(part, whole) {
            part = safeNumber(part);
            whole = safeNumber(whole);

            if (whole === 0) {
                return 0;
            }

            return Number(((part / whole) * 100).toFixed(1));
        }

        function normalizeBoolean(value) {
            return value === true || value === "true" || value === 1 || value === "1";
        }

        function normalizeAgeText(value) {
            return String(value || "")
                .trim()
                .replaceAll(" ", "")
                .replaceAll(",", "");
        }

        function normalizeAgeValue(value) {
            const cleaned = normalizeAgeText(value);

            const ageMap = {
                all: "all",
                "0-2": "0-2",
                "3-12": "3-12",
                "13-17": "13-17",
                "18-54": "18-54",
                "55-64": "55-64",
                "65+": "65+"
            };

            return ageMap[cleaned] || cleaned;
        }

        function normalizeLanguageValue(value) {
            const languageMap = {
                all: "all",
                english: "English",
                "haitian-creole": "Haitian Creole",
                spanish: "Spanish",
                portuguese: "Portuguese",
                khmer: "Khmer",
                other: "Other",
                English: "English",
                "Haitian Creole": "Haitian Creole",
                Spanish: "Spanish",
                Portuguese: "Portuguese",
                Khmer: "Khmer",
                Other: "Other"
            };

            return languageMap[value] || value;
        }

        function getLanguageSelectValue(languageValue) {
            const reverseLanguageMap = {
                all: "all",
                English: "english",
                "Haitian Creole": "haitian-creole",
                Spanish: "spanish",
                Portuguese: "portuguese",
                Khmer: "khmer",
                Other: "other"
            };

            return reverseLanguageMap[languageValue] || "all";
        }

        function getPatientMrn(patient) {
            return String(patient.mrn || patient.MRN || patient.Mrn || "").trim();
        }

        function hasKnownMrn(patient) {
            const mrn = getPatientMrn(patient).toLowerCase();

            if (!mrn) {
                return false;
            }

            if (
                mrn === "unknown" ||
                mrn === "unknown mrn" ||
                mrn === "null" ||
                mrn === "none" ||
                mrn === "nan" ||
                mrn === "n/a" ||
                mrn === "na"
            ) {
                return false;
            }

            return true;
        }

        function getPatientProvider(patient) {
            return String(patient.pcp || patient.PCP || patient.provider || patient.Provider || "").trim();
        }

        function isUsableProviderName(providerName) {
            const provider = String(providerName || "").trim();
            const normalized = provider.toLowerCase();

            if (!provider) {
                return false;
            }

            if (
                normalized === "unknown" ||
                normalized === "unassigned" ||
                normalized === "inactive/transferred" ||
                normalized === "inactive / transferred" ||
                normalized === "null" ||
                normalized === "none" ||
                normalized === "nan" ||
                normalized === "n/a" ||
                normalized === "na" ||
                normalized === "loading" ||
                normalized === "loading...."
            ) {
                return false;
            }

            return true;
        }

        function isDashboardPatient(patient) {
            return hasKnownMrn(patient) && isUsableProviderName(getPatientProvider(patient));
        }

        allPatients = allPatients.filter(patient => {
            return isDashboardPatient(patient);
        });

        allPcpVisits = allPcpVisits.filter(row => {
            return isUsableProviderName(row.pcp);
        });

        providerLastFillSummary = providerLastFillSummary.filter(row => {
            return isUsableProviderName(row.pcp);
        });

        providerNextFillSummary = providerNextFillSummary.filter(row => {
            return isUsableProviderName(row.pcp);
        });

        function getDefaultFilterState() {
            return {
                pcp: "all",
                age: "all",
                condition: "all",
                language: "all"
            };
        }

        function getCurrentFilterStateFromControls() {
            return {
                pcp: siteSelect ? siteSelect.value : "all",
                age: ageSelect ? normalizeAgeValue(ageSelect.value) : "all",
                condition: conditionSelect ? conditionSelect.value : "all",
                language: languageSelect ? normalizeLanguageValue(languageSelect.value) : "all"
            };
        }

        function setFilterControlsFromState(filterState) {
            isSyncingFilterControls = true;

            if (siteSelect) {
                siteSelect.value = filterState.pcp || "all";
            }

            if (ageSelect) {
                ageSelect.value = filterState.age || "all";
            }

            if (conditionSelect) {
                conditionSelect.value = filterState.condition || "all";
            }

            if (languageSelect) {
                languageSelect.value = getLanguageSelectValue(filterState.language || "all");
            }

            isSyncingFilterControls = false;
        }

        function getActiveTabId() {
            const activeTab = document.querySelector(".internal-tab.active");

            if (!activeTab) {
                return "dashboard-tab-1";
            }

            return activeTab.dataset.tabId || "dashboard-tab-1";
        }

        function patientMatchesCondition(patient, selectedCondition) {
            if (selectedCondition === "depression") {
                return normalizeBoolean(patient.has_depression);
            }

            if (selectedCondition === "diabetes") {
                return normalizeBoolean(patient.has_diabetes);
            }

            if (selectedCondition === "htn") {
                return normalizeBoolean(patient.has_htn);
            }

            if (selectedCondition === "obesity") {
                return normalizeBoolean(patient.has_obesity);
            }

            return true;
        }

        function filterPatientsWithState(filterState) {
            let filteredPatients = allPatients.slice();

            if (filterState.pcp !== "all") {
                filteredPatients = filteredPatients.filter(patient => {
                    return getPatientProvider(patient) === filterState.pcp;
                });
            }

            if (filterState.age !== "all") {
                filteredPatients = filteredPatients.filter(patient => {
                    return normalizeAgeText(patient.age_group) === filterState.age;
                });
            }

            if (filterState.language !== "all") {
                filteredPatients = filteredPatients.filter(patient => {
                    const language = patient.language || "Unknown";

                    if (filterState.language === "Other") {
                        return language === "Other" || language === "Unknown";
                    }

                    return language === filterState.language;
                });
            }

            if (filterState.condition !== "all") {
                filteredPatients = filteredPatients.filter(patient => {
                    return patientMatchesCondition(patient, filterState.condition);
                });
            }

            return filteredPatients;
        }

        function getConditionCounts(patientArray) {
            return {
                depression: patientArray.filter(patient => normalizeBoolean(patient.has_depression)).length,
                diabetes: patientArray.filter(patient => normalizeBoolean(patient.has_diabetes)).length,
                htn: patientArray.filter(patient => normalizeBoolean(patient.has_htn)).length,
                obesity: patientArray.filter(patient => normalizeBoolean(patient.has_obesity)).length
            };
        }

        function getAgeChartData(patientArray) {
            const total = patientArray.length;

            const age0To2Count = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "0-2").length;
            const age3To12Count = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "3-12").length;
            const age13To17Count = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "13-17").length;
            const age18To54Count = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "18-54").length;
            const age55To64Count = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "55-64").length;
            const age65PlusCount = patientArray.filter(patient => normalizeAgeText(patient.age_group) === "65+").length;

            return {
                labels: ["0-2", "3-12", "13-17", "18-54", "55-64", "65+"],
                counts: [age0To2Count, age3To12Count, age13To17Count, age18To54Count, age55To64Count, age65PlusCount],
                percents: [
                    calculatePercent(age0To2Count, total),
                    calculatePercent(age3To12Count, total),
                    calculatePercent(age13To17Count, total),
                    calculatePercent(age18To54Count, total),
                    calculatePercent(age55To64Count, total),
                    calculatePercent(age65PlusCount, total)
                ],
                colors: ["#afb671", "#e7c632", "#df7334", "#b86159", "#65a5cf", "#808080"]
            };
        }

        function getLanguageChartData(patientArray) {
            const total = patientArray.length;

            const englishCount = patientArray.filter(patient => patient.language === "English").length;
            const haitianCreoleCount = patientArray.filter(patient => patient.language === "Haitian Creole").length;
            const spanishCount = patientArray.filter(patient => patient.language === "Spanish").length;
            const portugueseCount = patientArray.filter(patient => patient.language === "Portuguese").length;
            const khmerCount = patientArray.filter(patient => patient.language === "Khmer").length;

            const otherLanguageCount = patientArray.filter(patient => {
                const language = patient.language || "Unknown";

                const known =
                    language === "English" ||
                    language === "Haitian Creole" ||
                    language === "Spanish" ||
                    language === "Portuguese" ||
                    language === "Khmer";

                return !known;
            }).length;

            return {
                labels: ["English", "Haitian Creole", "Spanish", "Portuguese", "Khmer", "Other"],
                counts: [englishCount, haitianCreoleCount, spanishCount, portugueseCount, khmerCount, otherLanguageCount],
                percents: [
                    calculatePercent(englishCount, total),
                    calculatePercent(haitianCreoleCount, total),
                    calculatePercent(spanishCount, total),
                    calculatePercent(portugueseCount, total),
                    calculatePercent(khmerCount, total),
                    calculatePercent(otherLanguageCount, total)
                ],
                colors: ["#afb671", "#e7c632", "#df7334", "#b86159", "#65a5cf", "#808080"]
            };
        }

        function getLastFillForPcp(selectedPcp) {
            if (selectedPcp === "all") {
                return centerLastFill || {};
            }

            const matchingRow = providerLastFillSummary.find(row => {
                return String(row.pcp || "").trim() === selectedPcp;
            });

            return matchingRow || {};
        }

        function getNextFillForPcp(selectedPcp) {
            if (selectedPcp === "all") {
                return centerNextFill || {};
            }

            const matchingRow = providerNextFillSummary.find(row => {
                return String(row.pcp || "").trim() === selectedPcp;
            });

            return matchingRow || {};
        }

        function getVisitsYtdForPcp(selectedPcp) {
            if (selectedPcp === "all") {
                return allPcpVisits.reduce((sum, row) => {
                    return sum + safeNumber(row.num_visits_ytd);
                }, 0);
            }

            return allPcpVisits.reduce((sum, row) => {
                const rowPcp = String(row.pcp || "").trim();

                if (rowPcp === selectedPcp) {
                    return sum + safeNumber(row.num_visits_ytd);
                }

                return sum;
            }, 0);
        }

        function createOrUpdateDoughnutChart(chartInstance, canvasId, chartLabels, chartCounts, chartPercents, chartColors) {
            const canvas = document.getElementById(canvasId);

            if (!canvas) {
                return chartInstance;
            }

            let chartData = chartLabels.map((label, index) => {
                return {
                    label: label,
                    count: safeNumber(chartCounts[index]),
                    percent: safeNumber(chartPercents[index]),
                    color: chartColors[index]
                };
            });

            const totalCount = chartData.reduce((sum, item) => {
                return sum + item.count;
            }, 0);

            if (totalCount === 0) {
                chartData = [
                    {
                        label: "No data",
                        count: 1,
                        percent: 100,
                        color: "#dddddd"
                    }
                ];
            }

            const labels = chartData.map(item => item.label);
            const counts = chartData.map(item => item.count);
            const percents = chartData.map(item => item.percent);
            const colors = chartData.map(item => item.color);

            if (chartInstance) {
                chartInstance.destroy();
            }

            return new Chart(canvas, {
                type: "doughnut",
                data: {
                    labels: labels,
                    datasets: [
                        {
                            data: counts,
                            backgroundColor: colors,
                            borderColor: "#ffffff",
                            borderWidth: 3,
                            hoverOffset: 12
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "48%",
                    plugins: {
                        title: {
                            display: false
                        },
                        legend: {
                            position: "bottom",
                            labels: {
                                boxWidth: 16,
                                boxHeight: 16,
                                padding: 16,
                                font: {
                                    size: 13
                                },
                                generateLabels: function () {
                                    return labels.map((label, index) => {
                                        return {
                                            text: `${label}: ${counts[index]} (${percents[index]}%)`,
                                            fillStyle: colors[index],
                                            strokeStyle: colors[index],
                                            lineWidth: 1,
                                            hidden: false,
                                            index: index
                                        };
                                    });
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const index = context.dataIndex;
                                    return `${labels[index]}: ${counts[index]} patients (${percents[index]}%)`;
                                }
                            }
                        },
                        datalabels: {
                            color: "#111111",
                            font: {
                                weight: "bold",
                                size: 12
                            },
                            formatter: function (value, context) {
                                const index = context.dataIndex;
                                const percent = percents[index];

                                if (percent < 4) {
                                    return "";
                                }

                                return `${labels[index]}\n${percent}%`;
                            }
                        }
                    }
                }
            });
        }

        function fillPcpDropdown(selectElement) {
            if (!selectElement) {
                return;
            }

            selectElement.innerHTML = "";

            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "All PCPs";
            selectElement.appendChild(allOption);

            const patientCountsByPcp = {};
            const visitsByPcp = {};

            allPatients.forEach(patient => {
                const pcp = getPatientProvider(patient);

                if (!isUsableProviderName(pcp)) {
                    return;
                }

                patientCountsByPcp[pcp] = (patientCountsByPcp[pcp] || 0) + 1;
            });

            allPcpVisits.forEach(row => {
                const pcp = String(row.pcp || "").trim();
                const visits = safeNumber(row.num_visits_ytd);

                if (!isUsableProviderName(pcp)) {
                    return;
                }

                visitsByPcp[pcp] = (visitsByPcp[pcp] || 0) + visits;
            });

            Object.keys(patientCountsByPcp)
                .filter(pcp => patientCountsByPcp[pcp] > 0)
                .sort((a, b) => a.localeCompare(b))
                .forEach(pcp => {
                    const option = document.createElement("option");
                    const patientCount = patientCountsByPcp[pcp] || 0;
                    const visitCount = visitsByPcp[pcp] || 0;

                    option.value = pcp;

                    if (visitCount > 0) {
                        option.textContent = `${pcp} (${patientCount} patients, ${visitCount.toLocaleString()} visits YTD)`;
                    } else {
                        option.textContent = `${pcp} (${patientCount} patients)`;
                    }

                    selectElement.appendChild(option);
                });
        }

         function buildDashboardPanelHtml(tabId, tabTitle) {
            return `
                <section class="upper-section redesigned-upper-section">

                    <!-- LEFT: UDS -->
                    <div class="dashboard-chart-card uds-card">

                        <div class="chart-card-text">
                            <h2>UDS Quality Measures</h2>
                        </div>

                        <div
                            class="uds-measures-container"
                            id="${tabId}-uds-measures">
                        </div>

                        <p class="uds-footnote">
                            * Percentages represent the proportion of patients who met the measure criteria.
                        </p>

                    </div>


                    <!-- CENTER: AGE + LANGUAGE -->
                    <div class="age-language-column">

                        <div class="dashboard-chart-card stacked-chart-card">

                            <div class="chart-card-visual">
                                <canvas id="${tabId}-age-chart"></canvas>
                            </div>

                            <div class="chart-card-text">
                                <h2>Age Distribution</h2>
                            </div>

                        </div>


                        <div class="dashboard-chart-card stacked-chart-card">

                            <div class="chart-card-visual">
                                <canvas id="${tabId}-language-chart"></canvas>
                            </div>

                            <div class="chart-card-text">
                                <h2>Language Breakdown</h2>
                            </div>

                        </div>

                    </div>


                    <!-- RIGHT: CHRONIC CONDITIONS -->
                    <div class="dashboard-chart-card chronic-condition-card">

                        <div class="chart-card-text">
                            <h2>Chronic Condition Overview</h2>
                            <p class="chart-description">
                                Patients seen by Primary/Peds in the past 12 months with one or more of the following diagnoses.
                            </p>
                        </div>

                        <div class="chronic-condition-list">

                            <div class="chronic-condition-row depression-stat">

                                <div class="chronic-condition-info">
                                    <span class="chronic-condition-name">Depression</span>
                                    <span
                                        class="chronic-condition-count"
                                        id="${tabId}-depression-count">
                                        Loading...
                                    </span>
                                </div>

                                <div class="chronic-condition-percent">
                                    <span id="${tabId}-depression-percent">0%</span>
                                </div>

                                <div class="chronic-condition-progress">
                                    <div
                                        class="chronic-condition-progress-fill depression-fill"
                                        id="${tabId}-depression-progress">
                                    </div>
                                </div>

                                <button
                                    class="view-patients-button"
                                    data-condition="depression"
                                    data-tab-id="${tabId}"
                                    type="button">
                                    View patients ↑
                                </button>

                            </div>


                            <div class="chronic-condition-row diabetes-stat">

                                <div class="chronic-condition-info">
                                    <span class="chronic-condition-name">Diabetes</span>
                                    <span
                                        class="chronic-condition-count"
                                        id="${tabId}-diabetes-count">
                                        Loading...
                                    </span>
                                </div>

                                <div class="chronic-condition-percent">
                                    <span id="${tabId}-diabetes-percent">0%</span>
                                </div>

                                <div class="chronic-condition-progress">
                                    <div
                                        class="chronic-condition-progress-fill diabetes-fill"
                                        id="${tabId}-diabetes-progress">
                                    </div>
                                </div>

                                <button
                                    class="view-patients-button"
                                    data-condition="diabetes"
                                    data-tab-id="${tabId}"
                                    type="button">
                                    View patients ↑
                                </button>

                            </div>


                            <div class="chronic-condition-row htn-stat">

                                <div class="chronic-condition-info">
                                    <span class="chronic-condition-name">Hypertension</span>
                                    <span
                                        class="chronic-condition-count"
                                        id="${tabId}-htn-count">
                                        Loading...
                                    </span>
                                </div>

                                <div class="chronic-condition-percent">
                                    <span id="${tabId}-htn-percent">0%</span>
                                </div>

                                <div class="chronic-condition-progress">
                                    <div
                                        class="chronic-condition-progress-fill htn-fill"
                                        id="${tabId}-htn-progress">
                                    </div>
                                </div>

                                <button
                                    class="view-patients-button"
                                    data-condition="Hypertension"
                                    data-tab-id="${tabId}"
                                    type="button">
                                    View patients ↑
                                </button>

                            </div>


                            <div class="chronic-condition-row obesity-stat">

                                <div class="chronic-condition-info">
                                    <span class="chronic-condition-name">Obesity</span>
                                    <span
                                        class="chronic-condition-count"
                                        id="${tabId}-obesity-count">
                                        Loading...
                                    </span>
                                </div>

                                <div class="chronic-condition-percent">
                                    <span id="${tabId}-obesity-percent">0%</span>
                                </div>

                                <div class="chronic-condition-progress">
                                    <div
                                        class="chronic-condition-progress-fill obesity-fill"
                                        id="${tabId}-obesity-progress">
                                    </div>
                                </div>

                                <button
                                    class="view-patients-button"
                                    data-condition="obesity"
                                    data-tab-id="${tabId}"
                                    type="button">
                                    View patients ↑
                                </button>

                            </div>

                        </div>

                        <p class="chronic-condition-footnote">
                            * Percentages are calculated out of the provider's panel population (not UDS).
                        </p>

                    </div>

                </section>


            

                <div class="lower-section tab-lower-section">
                    <div class="provider-productivity-container">
                        <div class="list-header">
                            <h2 class="list-title">Provider Productivity</h2>
                        </div>

                        <div class="provider-productivity-stats" id="${tabId}-provider-productivity"></div>
                    </div>

                    

                    <div class="care-patients">
                        <div class="center-overview-header">
                            <h2 class="center-overview-title" id="${tabId}-center-overview-title">
                                Center Overview
                            </h2>
                        </div>

                        <div class="upper-co">
                            <div class="upper-left-co-element">
                                <div class="info-icon" title="Total number of patients in this provider panel.">
                                    <img src="images/information.png" class="info-image" alt="Info">
                                    <span class="info-tooltip">Total number of patients assigned to this provider.</span>
                                </div>

                                <div class="co-stat" id="${tabId}-panel-size">Loading...</div>
                                <p>Panel Size</p>
                            </div>

                            <div class="upper-right-co-element">
                                <div class="info-icon" title="Total visits this year for the selected provider or center.">
                                    <img src="images/information.png" class="info-image" alt="Info">
                                    <span class="info-tooltip">Total visits this year.</span>
                                </div>

                                <div class="co-stat" id="${tabId}-patients-ytd">Loading...</div>
                                <p>Total Visits This Year</p>
                            </div>
                        </div>

                        <div class="lower-co">
                            <div class="lower-left-co-element">
                                <div class="info-icon" title="Most recent appointment fill rate.">
                                    <img src="images/information.png" class="info-image" alt="Info">
                                    <span class="info-tooltip">Percentage of patients who scheduled an appointment with the provider and actually met with them in the past day.</span>
                                </div>

                                <div class="co-stat" id="${tabId}-last-fill-rate">Loading...</div>
                                <p>Last Fill Rate</p>
                            </div>

                            <div class="lower-right-co-element">
                                <div class="info-icon" title="Projected or future appointment fill rate.">
                                    <img src="images/information.png" class="info-image" alt="Info">
                                    <span class="info-tooltip">Projected percentage (predicts next day) of patients who scheduled an appointment with the provider and actually met with them.</span>
                                </div>

                                <div class="co-stat" id="${tabId}-next-fill-rate">Loading...</div>
                                <p>Next Fill Rate</p>
                            </div>
                        </div>
                    </div>

    
                </div>
            `;
        }



        /**
         * add this html when the time coes or is approved
         <div class="extra-stats">
                        <div class="stat-1">
                            <p style="text-align: center;">Up for discussion</p>
                            <div class="number" style="padding-top: 20px;" id="${tabId}-patients-due-this-week">
                                Loading...
                            </div>
                            <p>Patients Due This Week</p>
                        </div>

                        <div class="stat-2">
                            <p style="text-align: center;">Up for discussion</p>
                            <div class="number" style="padding-top: 20px;" id="${tabId}-completed-task-count">
                                0
                            </div>
                            <p>Completed Tasks</p>
                        </div>
                    </div> 
         */

        function updateTab(tabId) {
            const tabState = tabStates[tabId];

            if (!tabState) {
                return;
            }

            tabState.patients = filterPatientsWithState(tabState.filterState);

            const patients = tabState.patients;
            const counts = getConditionCounts(patients);

            const depressionElement = document.getElementById(`${tabId}-depression-count`);
            const diabetesElement = document.getElementById(`${tabId}-diabetes-count`);
            const htnElement = document.getElementById(`${tabId}-htn-count`);
            const obesityElement = document.getElementById(`${tabId}-obesity-count`);

            if (depressionElement) depressionElement.textContent = counts.depression.toLocaleString();
            if (diabetesElement) diabetesElement.textContent = counts.diabetes.toLocaleString();
            if (htnElement) htnElement.textContent = counts.htn.toLocaleString();
            if (obesityElement) obesityElement.textContent = counts.obesity.toLocaleString();



            //Update UDS
            updateUdsDashboard(tabId, tabState.filterState.pcp);

            //Update Provider Productivity
            updateProviderProductivity(tabId, tabState.filterState.pcp);



            const ageData = getAgeChartData(patients);
            const languageData = getLanguageChartData(patients);

            tabState.ageChart = createOrUpdateDoughnutChart(
                tabState.ageChart,
                `${tabId}-age-chart`,
                ageData.labels,
                ageData.counts,
                ageData.percents,
                ageData.colors
            );

            tabState.languageChart = createOrUpdateDoughnutChart(
                tabState.languageChart,
                `${tabId}-language-chart`,
                languageData.labels,
                languageData.counts,
                languageData.percents,
                languageData.colors
            );

            updateTabLowerDashboard(tabId);
        }

        function updateTabLowerDashboard(tabId) {
            const tabState = tabStates[tabId];

            if (!tabState) {
                return;
            }

            const patients = tabState.patients;
            const filterState = tabState.filterState;
            const counts = getConditionCounts(patients);
            const total = patients.length;

            // const diabetesPercent = calculatePercent(counts.diabetes, total);
            // const htnPercent = calculatePercent(counts.htn, total);
            // const obesityPercent = calculatePercent(counts.obesity, total);
            // const depressionPercent = calculatePercent(counts.depression, total);

            const diabetesPercent = calculatePercent(counts.diabetes, total);
            const htnPercent = calculatePercent(counts.htn, total);
            const obesityPercent = calculatePercent(counts.obesity, total);
            const depressionPercent = calculatePercent(counts.depression, total);

            const depressionProgress =
                document.getElementById(`${tabId}-depression-progress`);

            const diabetesProgress =
                document.getElementById(`${tabId}-diabetes-progress`);

            const htnProgress =
                document.getElementById(`${tabId}-htn-progress`);

            const obesityProgress =
                document.getElementById(`${tabId}-obesity-progress`);

            if (depressionProgress) {
                depressionProgress.style.width = `${depressionPercent}%`;
            }

            if (diabetesProgress) {
                diabetesProgress.style.width = `${diabetesPercent}%`;
            }

            if (htnProgress) {
                htnProgress.style.width = `${htnPercent}%`;
            }

            if (obesityProgress) {
                obesityProgress.style.width = `${obesityPercent}%`;
            }







            const chronicRows = [
                { name: "obesity", percent: obesityPercent },
                { name: "diabetes", percent: diabetesPercent },
                { name: "htn", percent: htnPercent },
                { name: "depression", percent: depressionPercent }
            ];

            const progressColors = ["#5aeb36", "#e7c632", "#df7334", "#ee3524"];
            const sortedRows = chronicRows.slice().sort((a, b) => b.percent - a.percent);

            chronicRows.forEach(row => {
                const percentElement = document.getElementById(`${tabId}-${row.name}-percent`);
                const barElement = document.getElementById(`${tabId}-${row.name}-bar`);
                const rankIndex = sortedRows.findIndex(sortedRow => sortedRow.name === row.name);

                if (percentElement) {
                    percentElement.textContent = row.percent + "%";
                }

                if (barElement) {
                    barElement.style.width = row.percent + "%";
                    barElement.style.backgroundColor = progressColors[Math.max(rankIndex, 0)] || "#808080";
                }
            });

            const panelSizeElement = document.getElementById(`${tabId}-panel-size`);
            const patientsYtdElement = document.getElementById(`${tabId}-patients-ytd`);
            const lastFillRateElement = document.getElementById(`${tabId}-last-fill-rate`);
            const nextFillRateElement = document.getElementById(`${tabId}-next-fill-rate`);
            const centerOverviewTitleElement = document.getElementById(`${tabId}-center-overview-title`);
            const patientsDueThisWeekElement = document.getElementById(`${tabId}-patients-due-this-week`);

            const lastFillData = getLastFillForPcp(filterState.pcp);
            const nextFillData = getNextFillForPcp(filterState.pcp);
            const visitsYtd = getVisitsYtdForPcp(filterState.pcp);

            if (filterState.pcp === "all") {
                if (centerOverviewTitleElement) {
                    centerOverviewTitleElement.textContent = "Center Overview";
                }
            } else {
                const name = filterState.pcp;

                if (centerOverviewTitleElement) {
                    centerOverviewTitleElement.textContent = `${name}'s Overview`;
                }
            }

            const filledCount = safeNumber(lastFillData.filled);
            const totalSlots = safeNumber(lastFillData.total);
            const patientsDueThisWeekCount = Math.max(totalSlots - filledCount, 0);

            if (panelSizeElement) panelSizeElement.textContent = patients.length.toLocaleString();
            if (patientsYtdElement) patientsYtdElement.textContent = visitsYtd.toLocaleString();
            if (lastFillRateElement) lastFillRateElement.textContent = formatPercent(lastFillData.fill_rate);
            if (nextFillRateElement) nextFillRateElement.textContent = formatPercent(nextFillData.fill_rate);
            if (patientsDueThisWeekElement) patientsDueThisWeekElement.textContent = patientsDueThisWeekCount.toLocaleString();
        }

        function activateTab(tabId) {
            document.querySelectorAll(".internal-tab").forEach(tab => {
                tab.classList.remove("active");
            });

            document.querySelectorAll(".internal-tab-content").forEach(panel => {
                panel.classList.remove("active");
            });

            const selectedTab = document.querySelector(`.internal-tab[data-tab-id="${tabId}"]`);
            const selectedPanel = document.getElementById(tabId);

            if (selectedTab) {
                selectedTab.classList.add("active");
            }

            if (selectedPanel) {
                selectedPanel.classList.add("active");
            }

            const tabState = tabStates[tabId];

            if (tabState) {
                setFilterControlsFromState(tabState.filterState);

                setTimeout(() => {
                    if (tabState.ageChart) {
                        tabState.ageChart.resize();
                    }

                    if (tabState.languageChart) {
                        tabState.languageChart.resize();
                    }
                }, 50);
            }
        }

        function createNewTab() {
            tabCount += 1;

            const tabId = `dashboard-tab-${tabCount}`;
            const tabTitle = `Tab ${tabCount}`;
            const defaultFilterState = getDefaultFilterState();

            tabStates[tabId] = {
                title: tabTitle,
                filterState: { ...defaultFilterState },
                patients: [],
                ageChart: null,
                languageChart: null
            };

            const tabBar = document.getElementById("internal-tab-bar");
            const newTabButton = document.getElementById("new-tab-button");
            const tabShell = document.querySelector(".internal-tab-shell");

            if (!tabBar || !newTabButton || !tabShell) {
                return;
            }

            const newTab = document.createElement("button");
            newTab.className = "internal-tab";
            newTab.dataset.tabId = tabId;
            newTab.type = "button";

            newTab.innerHTML = `
                ${tabTitle}
                <span class="tab-close">×</span>
            `;

            tabBar.insertBefore(newTab, newTabButton);

            const newPanel = document.createElement("div");
            newPanel.className = "internal-tab-content";
            newPanel.id = tabId;
            newPanel.innerHTML = buildDashboardPanelHtml(tabId, tabTitle);

            tabShell.appendChild(newPanel);

            activateTab(tabId);
            updateTab(tabId);
        }

        function applyFiltersToActiveTab() {
            if (isSyncingFilterControls) {
                return;
            }

            const activeTabId = getActiveTabId();
            const tabState = tabStates[activeTabId];

            if (!tabState) {
                return;
            }

            tabState.filterState = { ...getCurrentFilterStateFromControls() };
            updateTab(activeTabId);
        }

        function resetActiveTabFilters() {
            const activeTabId = getActiveTabId();
            const tabState = tabStates[activeTabId];

            if (!tabState) {
                return;
            }

            const defaultFilterState = getDefaultFilterState();
            tabState.filterState = { ...defaultFilterState };
            setFilterControlsFromState(defaultFilterState);
            updateTab(activeTabId);
        }

        function getPatientsForCondition(conditionName, tabId) {
            const tabState = tabStates[tabId];

            if (!tabState) {
                return [];
            }

            return tabState.patients.filter(patient => {
                return patientMatchesCondition(patient, conditionName);
            });
        }

        function formatConditionTitle(conditionName) {
            const titleMap = {
                depression: "Patients with Depression",
                diabetes: "Patients with Diabetes",
                htn: "Patients with Hypertension",
                obesity: "Patients with Obesity"
            };

            return titleMap[conditionName] || "Patient List";
        }

        function openPatientOverlay(conditionName, tabId) {
            const overlay = document.getElementById("patient-overlay");
            const overlayTitle = document.getElementById("patient-overlay-title");
            const overlayList = document.getElementById("overlay-patient-list");

            if (!overlay || !overlayTitle || !overlayList) {
                return;
            }

            const patients = getPatientsForCondition(conditionName, tabId);

            overlayTitle.textContent = formatConditionTitle(conditionName);
            overlayList.innerHTML = "";

            if (patients.length === 0) {
                const li = document.createElement("li");
                li.textContent = "No patients found for this tab.";
                overlayList.appendChild(li);
            } else {
                patients.forEach(patient => {
                    const li = document.createElement("li");

                    const mrn = getPatientMrn(patient);
                    const pcp = getPatientProvider(patient);
                    const ageGroup = patient.age_group || "Unknown Age";
                    const language = patient.language || "Unknown Language";

                    li.textContent = `MRN ${mrn} - ${pcp} - ${ageGroup} - ${language}`;
                    overlayList.appendChild(li);
                });
            }

            overlay.classList.add("is-open");
            document.body.classList.add("overlay-open");
        }

        function closePatientOverlay() {
            const overlay = document.getElementById("patient-overlay");

            if (!overlay) {
                return;
            }

            overlay.classList.remove("is-open");
            document.body.classList.remove("overlay-open");
        }

        function setupEvents() {
            const tabBar = document.getElementById("internal-tab-bar");
            const newTabButton = document.getElementById("new-tab-button");
            const overlay = document.getElementById("patient-overlay");
            const closeButton = document.getElementById("close-patient-overlay");

            if (tabBar) {
                tabBar.addEventListener("click", event => {
                    const closeTarget = event.target.closest(".tab-close");
                    const tabButton = event.target.closest(".internal-tab");

                    if (!tabButton) {
                        return;
                    }

                    const tabId = tabButton.dataset.tabId;

                    if (closeTarget) {
                        event.stopPropagation();

                        if (tabId === "dashboard-tab-1") {
                            return;
                        }

                        const wasActive = tabButton.classList.contains("active");
                        const panel = document.getElementById(tabId);

                        if (tabStates[tabId]) {
                            if (tabStates[tabId].ageChart) {
                                tabStates[tabId].ageChart.destroy();
                            }

                            if (tabStates[tabId].languageChart) {
                                tabStates[tabId].languageChart.destroy();
                            }

                            delete tabStates[tabId];
                        }

                        tabButton.remove();

                        if (panel) {
                            panel.remove();
                        }

                        if (wasActive) {
                            activateTab("dashboard-tab-1");
                        }

                        return;
                    }

                    activateTab(tabId);
                });
            }

            if (newTabButton) {
                newTabButton.addEventListener("click", createNewTab);
            }

            if (applySidebarFiltersButton) {
                applySidebarFiltersButton.addEventListener("click", applyFiltersToActiveTab);
            }

            document.querySelectorAll(".apply").forEach(button => {
                button.addEventListener("click", applyFiltersToActiveTab);
            });

            document.querySelectorAll("#age, #condition, #language, #site").forEach(select => {
                if (select) {
                    select.addEventListener("change", () => {
                        if (!isSyncingFilterControls) {
                            applyFiltersToActiveTab();
                        }
                    });
                }
            });

            if (resetFilterButton) {
                resetFilterButton.addEventListener("click", resetActiveTabFilters);
            }

            if (refreshButton) {
                refreshButton.addEventListener("click", () => {
                    window.location.reload();
                });
            }

            document.addEventListener("click", event => {
                const patientButton = event.target.closest(".view-patients-button");

                if (patientButton) {
                    const conditionName = patientButton.dataset.condition;
                    const tabId = patientButton.dataset.tabId || getActiveTabId();

                    openPatientOverlay(conditionName, tabId);
                    return;
                }
            });

            if (closeButton) {
                closeButton.addEventListener("click", closePatientOverlay);
            }

            if (overlay) {
                overlay.addEventListener("click", event => {
                    if (event.target === overlay) {
                        closePatientOverlay();
                    }
                });
            }

            document.addEventListener("keydown", event => {
                if (event.key === "Escape") {
                    closePatientOverlay();
                }
            });
        }

        updateProfileUsername();
        fillPcpDropdown(siteSelect);

        const defaultFilterState = getDefaultFilterState();

        tabStates["dashboard-tab-1"] = {
            title: "Overview",
            filterState: { ...defaultFilterState },
            patients: [],
            ageChart: null,
            languageChart: null
        };

        const overviewPanel = document.getElementById("dashboard-tab-1");

        if (overviewPanel) {
            overviewPanel.innerHTML = buildDashboardPanelHtml("dashboard-tab-1", "Overview");
        }

        setFilterControlsFromState(defaultFilterState);
        setupEvents();
        updateTab("dashboard-tab-1");
    })
    .catch(error => {
        console.error("Error loading stats:", error);
    });