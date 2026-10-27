# Architecture and technical review

Wind Desk is a small read-only application. A versioned Elexon snapshot supports deterministic review of January decisions. The Python service owns all selection and calculation rules; React owns controls and presentation.

```mermaid
flowchart LR
  E[Elexon WINDFOR and FUELHH] -->|offline acquisition| I[Python ingestion script]
  I --> A[JSON archive and SHA-256 manifest]
  A --> V[Validate and index revisions]
  V --> S[Select latest publication at cutoff]
  S --> M[Align half-hours and calculate metrics]
  M --> F[FastAPI JSON and CSV]
  F --> R[React TypeScript interface]
```

## Data flow

`fetch_data.py` makes 65 daily API requests: 33 WINDFOR publication dates and 32 FUELHH settlement dates. A local ignored cache permits interrupted work to resume. Three workers limit concurrent load. HTTP timeouts and exponential retries cover transient failures. Assembly happens only after all requests succeed. Exact duplicate rows from overlapping boundaries are removed.

`load_engine()` verifies checksums and row counts, then creates revision indexes keyed by delivery timestamp. `Series.as_of()` uses a sorted list of publication times and binary search. It retains a full revision history rather than discarding everything except today's latest value. Conflicting values for an identical target/publication pair fail explicitly.

For decision day D, `periods()` constructs the London calendar day D+1 in UTC. Each half-hour target selects the hourly WINDFOR record covering that hour at the D cutoff. Actuals are joined on exact half-hour start time. A missing hour stays missing. Source resolution is validated at load time.

`metrics()` computes only matched errors. `decision()` adds forecast energy, coverage, issue-age warnings and prior error context. `accuracy()` aggregates the same cutoff policy across all 31 decisions. There is no separate frontend implementation of the mathematics.

`history_at()` prevents a subtler form of leakage: retrospective monthly errors are not reused as if traders knew them early in January. It only uses completed delivery days before the selected decision date, and selects actual revisions with publication times at or before the cutoff. The range requires 48 observations and exposes its sample count.

## API surface

- `GET /api/health`: archive validation and readiness.
- `GET /api/meta`: dates, source links, retrieval metadata, hashes and request provenance.
- `GET /api/decision?decision_date=2026-01-15&cutoff=09:00`: next-day periods, summary and historical context.
- `GET /api/accuracy?cutoff=09:00`: monthly, daily and hourly metrics, error histogram and worst periods.
- `GET /api/revisions?decision_date=2026-01-15&cutoff=09:00&hour=12`: eligible publication history for one delivery hour.
- `GET /api/export.csv?scope=day&decision_date=2026-01-15&cutoff=09:00`: auditable CSV; `scope=month` exports all 1,488 expected periods.
- `GET /api/docs`: interactive OpenAPI documentation.

Dates outside January and malformed cutoffs return 422. Missing or invalid archives return 503. The API does not accept writes, arbitrary fetch URLs or file paths.

## Frontend design

The three product views share date/cutoff state. URL query parameters retain the view for reproducible links. Requests use an AbortController so stale results cannot replace a more recent selection. Each fetch has explicit loading and error states. The displayed archive is historical, and actuals require an explicit hindsight toggle.

Charts have text descriptions and adjacent numerical tables or accessible day buttons. Forms have labels, focus indicators and keyboard controls. Missing numbers render as a dash. Responsive breakpoints convert the desktop rail into bottom navigation on narrow screens; wide audit tables scroll within their panel.

The hourly forecast is drawn as a step line, matching the alignment rule. The empirical range uses the same step representation. Actuals are drawn separately at half-hour resolution. Power is converted to GW only for presentation; API and CSV values remain MW.

## Runtime choices

The archive is approximately 2.4 MB. Loading and indexing it in memory is simpler than operating a database for a fixed historical pilot. A process-local singleton holds the index. Bounded LRU caches hold recent decision and accuracy responses. This keeps the service portable across local Uvicorn, Docker and Vercel's Python runtime.

Docker uses a Node build stage and a Python runtime stage. One process serves the static frontend and API from one origin, avoiding a CORS dependency. The container runs as an unprivileged user and has a health check. Compose additionally uses a read-only filesystem, a temporary `/tmp`, dropped capabilities and no privilege escalation.

Vercel serves the React build as static assets and invokes `api/index.py` for `/api/*`. The function bundle includes only the backend and snapshot needed at runtime; there is no writable database or runtime Elexon request. `framework: null` intentionally selects file-based Python functions rather than relying on automatic FastAPI preset detection.

## Review priorities

Start with the cutoff tests, then read `Series.as_of()`, `Engine.periods()` and `Engine.history_at()`. Next inspect `metrics()` and the hand-calculated test cases. Finally review the archive manifest and a CSV export against the source records.

The most consequential risks are methodological, not visual: confusing publication and delivery times, including future forecasts, treating hourly/half-hourly data as equivalent without an assumption, using future errors to calibrate earlier decisions, and confusing MW with MWh. Tests exercise these failure modes.

## Limits and next steps

Publication time is not proof of the client's actual receipt time. Original API ingestion timestamps and an immutable revision ledger would be needed for a production information-availability audit. Source corrections that overwrite a value without exposing a new historical publication cannot be reconstructed from this snapshot.

The forecast–outturn gap may include curtailment and different measurement coverage. More datasets would be required to isolate underlying wind forecasting performance. A larger history and out-of-sample calibration would be needed to use empirical ranges operationally.

Production extensions would include ingestion monitoring, a timestamped relational or object-store archive, schema-change alerts, authentication for client-specific positions, and demand/contract inputs. These are intentionally outside the two-dataset pilot. No ML forecast, automatic trade execution or invented purchase optimiser is included.
