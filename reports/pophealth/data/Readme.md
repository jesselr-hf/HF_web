# Population Health Dashboard Internship Project

## Project Overview

The Data Analytics department maintains several patient population reports. These reports identify groups of patients who meet specific clinical criteria.

Your assignment is to develop a visual dashboard that summarizes these populations and presents the information in a way that is easy to understand for clinical and administrative staff.

This project is divided into several phases, with each phase building upon the previous one.

---

# Learning Objectives

By completing this project, you will gain experience with:

* Python
* Pandas
* Matplotlib
* CSV data processing
* Basic HTML
* Dashboard design
* Data visualization
* Working with live SQL data

You should be prepared to explain your design choices and the reasoning behind your work.

---

# Data

You will be provided with five CSV files:

* Depression.csv
* Diabetics.csv
* HTN.csv
* Obese.csv
* TotalPop.csv

Each file contains two columns:

* PAT_ID
* PCP

The TotalPop file represents the overall patient population.

The other files represent subsets of that population.

---

# Phase 1: Build a Dashboard

## Goal

Create a dashboard that summarizes the population data.

The dashboard should include:

### Total patients in each population

Examples:

* Total Population
* Depression
* Diabetes
* Hypertension
* Obesity

### Percentage of total population

For each category, calculate:

Population Count / Total Population × 100

Display both the count and percentage.

---

## Visualizations

You may use your own judgment regarding which visualizations work best.

Possible options include:

* Bar charts
* Horizontal bar charts
* Pie charts
* Donut charts
* Combination charts
* KPI summary boxes

You are encouraged to experiment.

Be prepared to explain:

* Why you selected each visualization.
* What information it communicates.
* Why it is effective.

---

# Phase 2: Export Visuals

Once the dashboard is complete:

Generate PNG image files for each visualization.

These images should be suitable for inclusion on a webpage.

Your Python script should automatically regenerate these images whenever the data changes.

---

# Phase 3: Create a Web Dashboard

Create a simple webpage displaying the dashboard.

You may choose one of two approaches:

Option A:

Write a static index.html file.

Option B:

Have your Python script generate the HTML automatically.

The webpage should include:

* Title
* Date generated
* Summary statistics
* Dashboard images
* Any supporting information you believe would be useful

The webpage files will eventually be placed in:

Data Analytics\Jesse\web\reports\pophealth

The webpage will automatically be served from:

https://reports.hffcc.com/pophealth

Consider readability and ease of use when designing the page.

---

# Phase 4: Convert to Live Data

Initially, your program will use the provided CSV files.

Once everything is working:

Modify the program to pull data directly from the SQL query files instead of the CSV files.

The goal is to make the dashboard automatically update whenever new data is generated.

You should structure your code so that changing the data source requires minimal modification.

---

# Project Requirements

##

Source Files

Abhiraam\Populations\
                                  
Depression.csv                                  
Diabetics.csv                                   
HTN.csv                                         
Obese.csv                                       
Populations.py                                  
Readme.md                                       
TotalPop.csv   

## Use Python

Primary libraries:

* pandas
* matplotlib

Additional libraries may be used if appropriate.

---

## Code Quality

Your code should:

* Be readable.
* Use descriptive variable names.
* Include comments where appropriate.
* Avoid duplicated code.
* Break work into functions when practical.

---

## Documentation

Include a brief explanation of:

* How your code works.
* How to run it.
* Any assumptions you made.
* Why you chose your visualizations.

---

# Deliverables

By the end of the project, you should have:

## Python

* Script(s) to process the data.
* Script(s) to generate the dashboard.
* Script(s) to generate PNG files.
* Optional script to generate HTML.

## Dashboard

* Population summary.
* Counts.
* Percentages.
* Visualizations.

## Web Files

* index.html
* PNG images

## Documentation

A short write-up describing your approach and design decisions.

---

# Success Criteria

A successful project will:

* Correctly summarize the population data.
* Present the information clearly.
* Produce attractive and understandable visualizations.
* Generate reusable PNG graphics.
* Display the information on a webpage.
* Be easy to update as the data source changes.
* Demonstrate thoughtful design decisions.

---

# Final Question

When your project is complete, you should be able to answer:

"If someone unfamiliar with this data looked at your dashboard for thirty seconds, what are the most important things they would learn?"

Good dashboards answer important questions quickly.
