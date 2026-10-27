# Verification record

Checked locally on 27 October 2026. This records executed checks separately from checks that require a deployed environment.

## Passed locally

- **Python tests:** `.venv/bin/python -m pytest -q` — 36 passed. Tests cover calculation examples, inclusive forecast cutoffs, future-publication exclusion, actual revision filtering, missing values, zero generation, hourly alignment, energy conversion, duplicate conflicts, London daylight-saving boundaries, January decision boundaries, API validation, CSV exports and archive integrity.
- **Frontend production build:** `npm run build --prefix frontend` — TypeScript checking and Vite production compilation passed. Chart dependencies are split into a separate bundle.
- **Prepared-folder startup:** `./scripts/run-local.sh` started the app using its project-local Python environment. `/api/health` returned `status: "ok"` and `checksums_verified: true`. The same process served the built React application and API.
- **Frontend dependency audit:** `npm audit` in `frontend` — zero known vulnerabilities, including development dependencies. Vite was updated during verification to address reported advisories.
- **Python runtime dependency audit:** `pip-audit -r requirements.txt` — no known vulnerabilities reported. Runtime dependencies were updated before the final test run. Audits reflect the advisory databases available at check time, not a guarantee against all security defects.
- **Compose configuration:** `docker compose config --quiet` — valid configuration.
- **Vercel configuration:** `vercel.json` passed validation against the retrieved official Vercel configuration schema. The ASGI entry point, archive inclusion, static output directory and API rewrite are configured for a repository-root import with framework Other.

The test run emitted one upstream Starlette deprecation warning concerning its httpx-based TestClient. The tests completed successfully. This does not affect the application's HTTP runtime.

## Browser checks

The locally served production build was exercised in the in-app Chromium browser:

- Decision, accuracy and methodology views rendered successfully.
- Changing the decision date and cutoff updated the displayed data and shareable URL.
- The first decision day disabled backward navigation and showed the insufficient-history state.
- The final January decision correctly showed 1 February delivery and disabled forward navigation.
- Enabling actuals added the explicitly retrospective comparison and audit columns.
- Selecting a delivery hour changed the available publication history.
- Expanding the period audit displayed all 48 delivery rows.
- Clicking a day in the monthly analysis opened that decision.
- The default monthly calculation showed 1,488 matched half-hours and MAE of 2,041.96 MW.
- Desktop layout was inspected at 1440 × 1000; mobile layout at 390 × 844. The mobile page width and scroll width both measured 390 pixels, with no page-wide horizontal overflow.
- No browser console errors were reported in the final desktop check.

`preview.png` is a screenshot of the actual locally running application. Browser checks were performed interactively; no separate automated browser test suite is claimed. CSV content and headers are covered by the API test suite.

## Environment limitations and remaining verification

- **Container execution:** not verified locally. The Docker CLI was present, but its daemon was unavailable. The Compose configuration check does not prove that the image builds or runs. With a working Docker installation, run `docker compose up --build`, check `/api/health` and the app, then run `docker compose down`. The included GitHub Actions workflow also builds and smoke-tests the image after the user pushes the project; that workflow has not yet run.
- **Vercel deployment:** prepared but not performed, as requested. Configuration validation does not replace a real Vercel build and production smoke test. Follow `DEPLOYMENT.md` and verify both the UI and API on the public production domain.
- **Repository, video and submission:** no remote repository was created or pushed, no video was recorded/uploaded, and no submission form was sent. `DEMO_SCRIPT.md` supplies an 8-minute-45-second outline for the required customer and technical presentations. The user must add their final app/video links to the README and verify access before submitting.

## Reproduce the main checks

From the repository root after installing the documented dependencies:

```bash
source .venv/bin/activate
python -m pytest -q
npm run build --prefix frontend
npm audit --prefix frontend
docker compose config --quiet
```

For an optional Python advisory scan, install `pip-audit` in a tooling environment and run `pip-audit -r requirements.txt`. It is a verification tool, not an application dependency.
