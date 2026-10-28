# Deployment

The `.gitignore` excludes dependencies, the virtual environment, compiled output and request caches. Keep the `data` folder and `frontend/package-lock.json` committed: the former supplies reproducible real data, and the latter locks the frontend dependency graph.

## Import into Vercel

Import the repository as one project, with the repository root selected. Choose **Other** for the framework. Leave the settings supplied by `vercel.json` in place. The build uses Node 22 and the Python function uses Python 3.12 via `.python-version`.

The frontend build command is `npm run build --prefix frontend`; the output directory is `frontend/dist`. The install command is `npm ci --prefix frontend`. Vercel independently installs the Python function's `requirements.txt`.

No secret, API key or environment variable is needed. Elexon acquisition is a separate offline operation, and the archive is committed. Deployment does not need a running Docker daemon.

The official configuration references are [Vercel JSON configuration](https://vercel.com/docs/project-configuration/vercel-json), [Python runtime](https://vercel.com/docs/functions/runtimes/python), and [file-based Python functions](https://vercel.com/docs/functions/runtimes/python/api-directory).

## Verify the public result

Open the production URL in an incognito/private browser, without being signed into Vercel. Confirm the app loads and the date controls change the data. Open `/api/health` on the same domain and confirm `status: "ok"` and `checksums_verified: true`.

Check the 31 January decision: delivery must be 1 February. Check the 1 January decision: the historical error reference must be unavailable rather than using future observations. Download a month CSV and verify 1,488 data rows.

If Vercel shows a login/protection screen, review that project's deployment protection settings so the production link can be opened by the evaluator. Do not share a protected preview URL as the public app URL.

## Troubleshooting

- **Frontend works but `/api/health` is 404:** confirm the project root is the repository root, the framework is Other, and `api/index.py` plus `vercel.json` are in that root. Selecting `frontend` alone omits the backend.
- **HTTP 503 from the API:** confirm `data/manifest.json`, `data/windfor.json` and `data/fuelhh.json` were committed together. A hash mismatch is intentionally rejected.
- **Python import error:** ensure `backend/__init__.py` and `backend/app/__init__.py` are committed and the backend is included in the function bundle.
- **Node engine error:** select Node 22.12+ or a supported newer version in the project's build settings.
- **Local port 8000 already used:** stop the previous app or set `PORT=8001 ./scripts/run-local.sh`. If using Vite on 5173, also update its API proxy port.
- **Docker cannot connect to the daemon:** start a working Docker Desktop/Engine installation, then rerun `docker compose up --build`. The local Python option can be used independently.
