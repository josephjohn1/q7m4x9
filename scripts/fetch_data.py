"""Refresh the reproducible January decision archive from Elexon only.

Run from the repository root: python scripts/fetch_data.py
Responses are cached per request; --refresh bypasses that cache.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://data.elexon.co.uk/bmrs/api/v1"


def dates(first: date, last: date):
    while first <= last:
        yield first
        first += timedelta(days=1)


def acquire(dataset: str, day: date, refresh: bool) -> tuple[list, dict]:
    if dataset == "WINDFOR":
        params = {"publishDateTimeFrom": f"{day}T00:00:00Z",
                  "publishDateTimeTo": f"{day + timedelta(days=1)}T00:00:00Z"}
    else:
        params = {"settlementDateFrom": str(day), "settlementDateTo": str(day), "fuelType": "WIND"}
    url = f"{BASE}/datasets/{dataset}/stream?{urlencode(params)}"
    cache = ROOT / ".cache" / f"{dataset}-{day}.json"
    cache.parent.mkdir(exist_ok=True)
    if cache.exists() and not refresh:
        payload = json.loads(cache.read_text())
    else:
        for attempt in range(5):
            try:
                response = httpx.get(url, timeout=60, headers={"Accept": "application/json"})
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, list) or not payload:
                    raise ValueError(f"Empty or invalid response: {url}")
                cache.write_text(json.dumps(payload, separators=(",", ":")))
                break
            except (httpx.HTTPError, ValueError):
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
    print(f"{dataset} {day}: {len(payload)} rows", flush=True)
    return payload, {"url": url, "rows": len(payload), "cache_file": cache.name,
                     "retrieved_at": datetime.fromtimestamp(cache.stat().st_mtime, timezone.utc).isoformat()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    tasks = [("WINDFOR", d) for d in dates(date(2025, 12, 30), date(2026, 1, 31))]
    tasks += [("FUELHH", d) for d in dates(date(2026, 1, 1), date(2026, 2, 1))]
    with ThreadPoolExecutor(max_workers=3) as pool:
        responses = list(pool.map(lambda t: acquire(*t, args.refresh), tasks))
    datasets, requests = {"WINDFOR": [], "FUELHH": []}, []
    for (dataset, _), (rows, info) in zip(tasks, responses):
        datasets[dataset].extend(rows)
        requests.append(info)
    manifest = {
        "retrieved_at": max(request["retrieved_at"] for request in requests),
        "snapshot_created_at": datetime.now(timezone.utc).isoformat(),
        "provider": "Elexon Insights Solution",
        "decision_dates": {"from": "2026-01-01", "to": "2026-01-31"},
        "delivery_dates": {"from": "2026-01-02", "to": "2026-02-01"},
        "requests": requests,
        "datasets": {},
    }
    output = ROOT / "data"
    output.mkdir(exist_ok=True)
    for dataset, rows in datasets.items():
        unique = {json.dumps(r, sort_keys=True, separators=(",", ":")): r for r in rows}
        rows = sorted(unique.values(), key=lambda r: (r["startTime"], r["publishTime"], r.get("generation", 0)))
        blob = json.dumps(rows, separators=(",", ":")).encode()
        path = output / f"{dataset.lower()}.json"
        path.write_bytes(blob)
        manifest["datasets"][dataset] = {
            "file": path.name, "rows": len(rows),
            "sha256": hashlib.sha256(blob).hexdigest(),
            "start_time_min": min(r["startTime"] for r in rows),
            "start_time_max": max(r["startTime"] for r in rows),
            "publish_time_min": min(r["publishTime"] for r in rows),
            "publish_time_max": max(r["publishTime"] for r in rows),
        }
    # Manifest is written last; a failed fetch never publishes a partial archive.
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["datasets"], indent=2))


if __name__ == "__main__":
    main()
