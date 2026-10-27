# Two part video demo

Target duration: **8 minutes 45 seconds**. Part 1 is 4 minutes 15 seconds; part 2 is 4 minutes 30 seconds. Leave the remaining time as a buffer. Rehearse and explain the code in your own words before recording.

Use the deployed app for the final recording when it is available. Start on 15 January 2026, cutoff 09:00, Decision workspace, actuals hidden. Keep your code editor open with `analysis.py`, `main.py`, the tests, Dockerfile and README. Turn off desktop notifications and avoid showing account credentials or unrelated tabs.

## Part 1 Customer presentation

### 0:00–0:40 The decision

**On screen:** the decision workspace.

“This pilot gives your day-ahead team a traceable view of wind generation forecasts and the error around them. The operational question is what information was available when you had to decide, and how much uncertainty that forecast carried.

The pilot uses only the two Elexon datasets in the brief: wind forecasts and actual metered wind generation. It covers decisions made throughout January 2026.”

### 0:40–1:30 Reconstruct the forecast

**On screen:** point to the date, cutoff, delivery day and four summary values. Briefly change the cutoff to 05:00, then return it to 09:00.

“Here we are replaying a decision at nine in the morning on 15 January for delivery on 16 January. The selected forecast averages 7.93 gigawatts across the next day, equivalent to 190.33 gigawatt-hours. All 48 delivery half-hours are covered.

When I change the cutoff, the app selects the most recent forecast that had actually been published by that time. Returning to nine selects the 07:30 publication. A forecast issued later that day is excluded, even though we can retrieve it today.”

### 1:30–2:25 Use the uncertainty context

**On screen:** hover over the forecast profile; point to the shaded range and the shortfall reference.

“The line shows the delivery profile. The shaded range comes from forecast errors on earlier completed days, using only actuals published before this decision. The prior mean absolute error here is about 2.11 gigawatts. The historical 90th-percentile shortfall reference is 4.34 gigawatts.

Those figures tell the buyer that the central forecast alone leaves meaningful exposure. This is a historical stress reference with a limited sample, not a guaranteed confidence interval or an instruction to buy that much power. On the earliest January dates the app shows insufficient history instead of borrowing information from the future.”

### 2:25–3:25 Evaluate the outcome

**On screen:** enable “Show actuals — hindsight”, then open Forecast accuracy.

“Actual generation is deliberately hidden until I choose retrospective review. We can now compare what was expected with what arrived.

Across all January decisions at the same 09:00 cutoff, the average absolute miss is 2.04 gigawatts. RMSE is 2.51 gigawatts, and signed bias is positive 1.75 gigawatts. Wind was overforecast in about 85 percent of periods. The weighted absolute error is 18.1 percent.

The daily chart makes large misses easy to investigate. Clicking a day takes us back to the forecast that was available for that decision. The hourly profile and error distribution show the shape of the historical misses.”

### 3:25–4:15 Make the pilot auditable

**On screen:** return to a decision, show Period audit and Follow a forecast, then briefly open Data & methodology.

“Every period retains its publication timestamp, and we can follow revisions for a delivery hour. CSV exports make the result reviewable outside the portal. The data page documents the source archive and the assumptions.

The forecast–actual gap can include operational effects such as curtailment; these two sources cannot isolate the cause. To turn national wind into your own purchase volume, we would next need your demand, contracted supply and exposure to that wind. The pilot establishes a transparent forecast and error workflow that those inputs can build on.”

## Part 2 Technical review

### 4:15–5:00 Architecture

**On screen:** README structure, then the architecture diagram in `ARCHITECTURE.md`.

“The frontend is React with TypeScript and Recharts. The backend is Python with FastAPI. All calculation and publication-selection logic lives in Python; the browser handles controls and presentation.

For this bounded historical pilot, I chose a versioned JSON archive instead of a database. The complete archive is small and bundled with the application. That makes the demo deterministic and keeps upstream API availability out of the request path. Vercel serves static React assets and a Python function; Docker provides a single-origin portable runtime.”

### 5:00–5:55 Acquisition and validation

**On screen:** `scripts/fetch_data.py`, then `data/manifest.json`.

“The ingestion script queries WINDFOR by publication date so it retains all vintages. FUELHH is queried by settlement date with the WIND filter. It uses daily chunks, three workers, timeouts, retries and a resumable cache.

The manifest records exact request URLs, retrieval times, row counts and SHA-256 hashes. At load time the service verifies integrity and rejects invalid numbers, unexpected source resolution and conflicting same-time records. If the archive is invalid, users see an error instead of substituted data.

The decision window is January, so the delivery window ends on 1 February. December publications provide a lookback for the first January cutoff; no December decisions are scored.”

### 5:55–6:55 The essential selection rule

**On screen:** `Series.as_of()`, `Engine.periods()` and `Engine.history_at()` in `analysis.py`.

“The revision index maps each target timestamp to a sorted list of publication times. A binary search selects the latest publication at or before the decision cutoff. The boundary is inclusive.

This archive's forecasts are hourly and actuals are half-hourly. I hold each forecast constant inside its hour and never carry it across a missing hour. The API keeps MW; energy multiplies each half-hour by 0.5 hours.

The historical error reference is also protected against lookahead. It excludes the current delivery day and future actual revisions. This is why it differs from the full-month retrospective scores.”

### 6:55–7:45 API and interface

**On screen:** `main.py`, API docs at `/api/docs`, and `frontend/src/api.ts`.

“The API separates decision profiles, monthly accuracy, publication histories, metadata and CSV export. Dates and cutoff formats are validated. It has no write endpoints or arbitrary upstream URL input.

The frontend shares date and cutoff state across views and stores it in the URL. Requests are abortable, preventing stale responses from replacing a newer selection. It has explicit loading, error and missing-data states. Actuals are marked as hindsight; forecast power and energy have separate units. Charts are accompanied by tables or labelled controls, and the layout adapts to mobile screens.”

### 7:45–8:45 Validation and handover

**On screen:** run `python -m pytest -q`, show the build output, Dockerfile and CI workflow.

“The tests focus on the failure modes that would change a purchasing interpretation: later forecasts leaking into the past, future actual revisions entering the risk reference, missing values becoming zero, incorrect units, and the January boundary. There are also hand-calculated numerical tests and end-to-end checks against the included archive.

The production React build and Python tests have been checked. GitHub Actions repeats them and builds and smoke-tests the container. The README contains local, Docker and Vercel instructions, the data methodology and an explicit disclosure of Codex assistance.

For production I would extend the archive into an immutable revision store, monitor ingestion and schema changes, and calibrate uncertainty over a longer out-of-sample history. Client demand and contracts would be separate inputs. Those additions are outside this two-dataset pilot.”

**Before recording this final paragraph:** update the validation statement to match what has actually passed after your deployment. Do not claim the Docker CI job or public deployment passed until you have checked them.

## After recording

Confirm the complete video is under ten minutes and each part under five. Upload it to YouTube as unlisted. Open the link in a private browser to confirm playback, then add it to the README and the submission form. The script is recording support, not a replacement for the required video.
