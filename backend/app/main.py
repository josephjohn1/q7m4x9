"""Read-only API. The same ASGI app serves Docker and Vercel."""
from datetime import date
import csv
from io import StringIO
import logging
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .analysis import Engine, cutoff_for, decision_dates, load_engine

app = FastAPI(title="Wind Desk API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
log = logging.getLogger(__name__)
Cutoff = Annotated[str, Query(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]


def engine() -> Engine:
    try:
        return load_engine()
    except (OSError, ValueError, KeyError) as exc:
        log.exception("Archive could not be loaded")
        raise HTTPException(503, "Data archive unavailable or invalid. Run scripts/fetch_data.py and restart.") from exc


def check(day: date, cutoff: str):
    try:
        cutoff_for(day, cutoff)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/") and response.status_code == 200:
        response.headers["Cache-Control"] = "public, max-age=300"
    return response


@app.get("/api/health")
def health(data: Engine = Depends(engine)):
    return {"status": "ok", "snapshot": data.manifest.get("retrieved_at"), "checksums_verified": True}


@app.get("/api/meta")
def metadata(data: Engine = Depends(engine)):
    return data.metadata()


@app.get("/api/decision")
def decision(decision_date: date = date(2026, 1, 15), cutoff: Cutoff = "09:00", data: Engine = Depends(engine)):
    check(decision_date, cutoff)
    return data.decision(decision_date, cutoff)


@app.get("/api/accuracy")
def accuracy(cutoff: Cutoff = "09:00", data: Engine = Depends(engine)):
    return data.accuracy(cutoff)


@app.get("/api/revisions")
def revisions(decision_date: date, hour: Annotated[int, Query(ge=0, le=23)] = 12,
              cutoff: Cutoff = "09:00", data: Engine = Depends(engine)):
    check(decision_date, cutoff)
    return data.revisions(decision_date, cutoff, hour)


@app.get("/api/export.csv")
def export(scope: Literal["day", "month"] = "day", decision_date: date = date(2026, 1, 15),
           cutoff: Cutoff = "09:00", data: Engine = Depends(engine)):
    check(decision_date, cutoff)
    days = [decision_date] if scope == "day" else decision_dates()
    rows = [row for day in days for row in data.periods(day, cutoff)]
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    name = str(decision_date) if scope == "day" else "january-decisions"
    return Response(output.getvalue(), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="wind-desk-{name}-{cutoff.replace(":", "")}.csv"'})


# Docker's single origin serves the built React app. Vercel serves it from the CDN.
dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
