import csv
from io import StringIO

from fastapi.testclient import TestClient
import pytest

from backend.app.main import app

client = TestClient(app)


@pytest.mark.parametrize("path", ["/api/health", "/api/meta", "/api/decision", "/api/accuracy", "/api/revisions?decision_date=2026-01-15"])
def test_api_read_endpoints(path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("query", ["decision_date=2026-02-01", "decision_date=bad", "cutoff=24:00", "cutoff=9:00", "cutoff=09:60"])
def test_invalid_query_returns_422(query):
    assert client.get(f"/api/decision?{query}").status_code == 422


def test_csv_month_includes_february_delivery_and_provenance():
    response = client.get("/api/export.csv?scope=month&cutoff=09:00")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(StringIO(response.text)))
    assert len(rows) == 1488
    assert rows[-1]["start_time"] == "2026-02-01T23:30:00Z"
    assert rows[0]["forecast_published_at"] <= rows[0]["cutoff_at"]
    assert "january-decisions" in response.headers["content-disposition"]


def test_earliest_day_has_no_lookahead_risk_reference():
    result = client.get("/api/decision?decision_date=2026-01-01").json()
    assert result["summary"]["history_periods"] == 0
    assert result["summary"]["historical_p90_shortfall_mw"] is None
    assert all(row["range_low_mw"] is None for row in result["periods"])


def test_revisions_are_all_available_and_exactly_one_is_selected():
    result = client.get("/api/revisions?decision_date=2026-01-15&hour=12&cutoff=09:00").json()
    assert all(row["publish_time"] <= result["cutoff_at"] for row in result["revisions"])
    assert sum(row["selected"] for row in result["revisions"]) == 1
    assert result["revisions"][-1]["selected"] is True


def test_invalid_archive_is_visible_503(monkeypatch):
    import backend.app.main as main
    def fail():
        raise ValueError("bad checksum")
    monkeypatch.setattr(main, "load_engine", fail)
    assert client.get("/api/health").status_code == 503
    assert "archive unavailable" in client.get("/api/decision").json()["detail"]


def test_unknown_api_is_404_not_html():
    assert client.get("/api/does-not-exist").status_code == 404
