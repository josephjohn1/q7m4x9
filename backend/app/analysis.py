"""Pure, publication-aware analytics for the fixed January decision window."""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
from statistics import mean
from zoneinfo import ZoneInfo

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc
FIRST, LAST = date(2026, 1, 1), date(2026, 1, 31)
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Source timestamps must include a timezone")
    return parsed.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def cutoff_for(day: date, cutoff: str) -> datetime:
    if not FIRST <= day <= LAST:
        raise ValueError("Decision date must be between 2026-01-01 and 2026-01-31")
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cutoff):
        raise ValueError("Cutoff must be HH:MM in Europe/London")
    return datetime.combine(day, time.fromisoformat(cutoff), LONDON).astimezone(UTC)


def decision_dates():
    return [FIRST + timedelta(days=i) for i in range((LAST - FIRST).days + 1)]


def settlement_times(delivery_day: date):
    start = datetime.combine(delivery_day, time.min, LONDON).astimezone(UTC)
    end = datetime.combine(delivery_day + timedelta(days=1), time.min, LONDON).astimezone(UTC)
    while start < end:
        yield start
        start += timedelta(minutes=30)


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lo = int(position)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (position - lo)


@dataclass(frozen=True)
class Record:
    start: datetime
    published: datetime
    mw: float


class Series:
    """Index all revisions; never silently choose between conflicting ties."""

    def __init__(self, rows: list[dict], dataset: str):
        grouped: dict[datetime, dict[datetime, Record]] = defaultdict(dict)
        duplicates = 0
        for row in rows:
            if row.get("dataset") != dataset:
                raise ValueError(f"Unexpected dataset in {dataset} archive")
            if dataset == "FUELHH" and row.get("fuelType") != "WIND":
                raise ValueError("Actual archive contains a non-wind record")
            start, published = parse_time(row["startTime"]), parse_time(row["publishTime"])
            raw_mw = row["generation"]
            if isinstance(raw_mw, bool) or not isinstance(raw_mw, (int, float)):
                raise ValueError("Generation must be a number")
            mw = float(raw_mw)
            if not math.isfinite(mw) or mw < 0:
                raise ValueError("Generation must be finite and non-negative")
            if start.second or start.microsecond or start.minute not in (0, 30):
                raise ValueError("Off-grid source timestamp")
            if dataset == "WINDFOR" and start.minute != 0:
                raise ValueError("This archive adapter expects hourly WINDFOR; review changed source resolution")
            record = Record(start, published, mw)
            previous = grouped[start].get(published)
            if previous and previous.mw != mw:
                raise ValueError("Conflicting values share a target and publication timestamp")
            duplicates += previous is not None
            grouped[start][published] = record
        self.rows = {start: sorted(revisions.values(), key=lambda r: r.published)
                     for start, revisions in grouped.items()}
        self.times = {start: [r.published for r in rows] for start, rows in self.rows.items()}
        self.duplicates = duplicates

    def as_of(self, target: datetime, cutoff: datetime | None = None) -> Record | None:
        rows = self.rows.get(target, [])
        if not rows:
            return None
        if cutoff is None:
            return rows[-1]
        index = bisect_right(self.times[target], cutoff) - 1
        return rows[index] if index >= 0 else None


def metrics(rows: list[dict]) -> dict:
    pairs = [r for r in rows if r["forecast_mw"] is not None and r["actual_mw"] is not None]
    errors = [r["forecast_mw"] - r["actual_mw"] for r in pairs]
    actual_sum = sum(r["actual_mw"] for r in pairs)
    result = {
        "expected_periods": len(rows), "matched_periods": len(pairs),
        "forecast_periods": sum(r["forecast_mw"] is not None for r in rows),
        "actual_periods": sum(r["actual_mw"] is not None for r in rows),
        "coverage_pct": 100 * len(pairs) / len(rows) if rows else 0,
        "mae_mw": mean(abs(e) for e in errors) if errors else None,
        "rmse_mw": math.sqrt(mean(e * e for e in errors)) if errors else None,
        "bias_mw": mean(errors) if errors else None,
        "wape_pct": 100 * sum(abs(e) for e in errors) / actual_sum if actual_sum else None,
        "p90_abs_error_mw": quantile([abs(e) for e in errors], .9),
        "overforecast_pct": 100 * sum(e > 0 for e in errors) / len(errors) if errors else None,
        "shortfall_mwh": .5 * sum(max(e, 0) for e in errors) if errors else None,
        "surplus_mwh": .5 * sum(max(-e, 0) for e in errors) if errors else None,
    }
    return result


class Engine:
    def __init__(self, forecasts: list[dict], actuals: list[dict], manifest: dict | None = None):
        self.forecasts = Series(forecasts, "WINDFOR")
        self.actuals = Series(actuals, "FUELHH")
        self.manifest = manifest or {}

    def periods(self, day: date, cutoff: str) -> list[dict]:
        at = cutoff_for(day, cutoff)
        rows = []
        for i, target in enumerate(settlement_times(day + timedelta(days=1)), start=1):
            # Zero-order hold only inside this exact hour. Never fill an absent hour.
            forecast = self.forecasts.as_of(target.replace(minute=0), at)
            actual = self.actuals.as_of(target)
            rows.append({
                "decision_date": str(day), "cutoff_at": iso(at),
                "start_time": iso(target), "time": target.astimezone(LONDON).strftime("%H:%M"),
                "settlement_period": i,
                "forecast_mw": forecast.mw if forecast else None,
                "actual_mw": actual.mw if actual else None,
                "error_mw": forecast.mw - actual.mw if forecast and actual else None,
                "forecast_published_at": iso(forecast.published) if forecast else None,
                "forecast_target_time": iso(forecast.start) if forecast else None,
                "actual_published_at": iso(actual.published) if actual else None,
                "lead_hours": (target - forecast.published).total_seconds() / 3600 if forecast else None,
            })
        return rows

    def history_at(self, day: date, cutoff: str) -> list[float]:
        """Errors from completed prior delivery days, using actuals known at cutoff."""
        at = cutoff_for(day, cutoff)
        errors = []
        for prior_day in decision_dates():
            if prior_day + timedelta(days=1) >= day:
                break
            for row in self.periods(prior_day, cutoff):
                target = parse_time(row["start_time"])
                actual = self.actuals.as_of(target, at)
                if actual and row["forecast_mw"] is not None:
                    errors.append(row["forecast_mw"] - actual.mw)
        return errors

    @lru_cache(maxsize=128)
    def decision(self, day: date, cutoff: str) -> dict:
        rows = self.periods(day, cutoff)
        at = cutoff_for(day, cutoff)
        errors = self.history_at(day, cutoff)
        # Descriptive empirical range, not a calibrated confidence interval.
        low_error = quantile(errors, .1) if len(errors) >= 48 else None
        high_error = quantile(errors, .9) if len(errors) >= 48 else None
        for row in rows:
            forecast = row["forecast_mw"]
            row["range_low_mw"] = max(0, forecast - high_error) if forecast is not None and high_error is not None else None
            row["range_high_mw"] = max(0, forecast - low_error) if forecast is not None and low_error is not None else None
        values = [r["forecast_mw"] for r in rows if r["forecast_mw"] is not None]
        publications = sorted({r["forecast_published_at"] for r in rows if r["forecast_published_at"]})
        warnings = []
        if len(values) != len(rows):
            warnings.append("Some delivery periods have no forecast available before the cutoff.")
        if len(publications) > 1:
            warnings.append("This profile combines publication vintages; inspect the period audit.")
        ages = [(at - parse_time(p)).total_seconds() / 3600 for p in publications]
        if ages and max(ages) > 8:
            warnings.append("At least one selected forecast is more than 8 hours old at the cutoff.")
        if len(errors) < 48:
            warnings.append("Insufficient completed January history for an empirical error range.")
        return {
            "decision_date": str(day), "delivery_date": str(day + timedelta(days=1)),
            "cutoff_at": iso(at), "cutoff": cutoff, "timezone": "Europe/London",
            "periods": rows, "metrics": metrics(rows), "warnings": warnings,
            "summary": {
                "mean_forecast_mw": mean(values) if values else None,
                "forecast_mwh": .5 * sum(values) if len(values) == len(rows) else None,
                "min_forecast_mw": min(values) if values else None,
                "max_forecast_mw": max(values) if values else None,
                "publications": publications,
                "max_forecast_age_hours": max(ages) if ages else None,
                "history_periods": len(errors),
                "historical_mae_mw": mean(abs(e) for e in errors) if errors else None,
                "historical_p90_shortfall_mw": max(0, high_error) if high_error is not None else None,
            },
        }

    @lru_cache(maxsize=32)
    def accuracy(self, cutoff: str) -> dict:
        cutoff_for(FIRST, cutoff)
        days, rows = [], []
        for day in decision_dates():
            periods = self.periods(day, cutoff)
            rows.extend(periods)
            days.append({"decision_date": str(day), "delivery_date": str(day + timedelta(days=1)),
                         **metrics(periods)})
        hourly = [{"hour": f"{hour:02d}:00", **metrics([r for r in rows if r["time"].startswith(f"{hour:02d}:")])}
                  for hour in range(24)]
        errors = [r["error_mw"] for r in rows if r["error_mw"] is not None]
        step = 500
        lo = math.floor(min(errors) / step) * step if errors else 0
        hi = math.floor(max(errors) / step) * step if errors else 0
        histogram = [{"from_mw": start, "to_mw": start + step,
                      "count": sum(start <= e < start + step for e in errors)}
                     for start in range(lo, hi + step, step)]
        worst = sorted([r for r in rows if r["error_mw"] is not None], key=lambda r: abs(r["error_mw"]), reverse=True)[:8]
        return {"cutoff": cutoff, "metrics": metrics(rows), "daily": days,
                "hourly": hourly, "histogram": histogram, "worst_periods": worst}

    def revisions(self, day: date, cutoff: str, hour: int) -> dict:
        at = cutoff_for(day, cutoff)
        if not 0 <= hour <= 23:
            raise ValueError("Hour must be 0–23")
        target = datetime.combine(day + timedelta(days=1), time(hour), LONDON).astimezone(UTC)
        rows = [r for r in self.forecasts.rows.get(target, []) if r.published <= at]
        return {"target_time": iso(target), "cutoff_at": iso(at), "revisions": [
            {"publish_time": iso(r.published), "generation_mw": r.mw,
             "selected": i == len(rows) - 1} for i, r in enumerate(rows)]}

    def metadata(self) -> dict:
        return {
            "manifest": self.manifest,
            "decision_dates": [str(d) for d in decision_dates()],
            "timezone": "Europe/London", "default_cutoff": "09:00",
            "forecast_resolution_minutes": 60, "actual_resolution_minutes": 30,
            "duplicate_forecast_rows": self.forecasts.duplicates,
            "duplicate_actual_rows": self.actuals.duplicates,
            "checksums_verified": bool(self.manifest),
            "sources": [
                {"label": "Elexon FUELHH actuals", "url": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"},
                {"label": "Elexon WINDFOR forecasts", "url": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"},
                {"label": "Elexon forecast coverage", "url": "https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest"},
            ],
        }


@lru_cache(maxsize=1)
def load_engine() -> Engine:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text())
    values = {}
    for dataset, filename in [("WINDFOR", "windfor.json"), ("FUELHH", "fuelhh.json")]:
        blob = (DATA_DIR / filename).read_bytes()
        expected = manifest["datasets"][dataset]
        if hashlib.sha256(blob).hexdigest() != expected["sha256"]:
            raise ValueError(f"Checksum mismatch for {dataset}; refresh the archive")
        values[dataset] = json.loads(blob)
        if len(values[dataset]) != expected["rows"]:
            raise ValueError(f"Row-count mismatch for {dataset}")
    return Engine(values["WINDFOR"], values["FUELHH"], manifest)
