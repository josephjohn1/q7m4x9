from datetime import date, timedelta
import math

import pytest

from backend.app.analysis import Engine, Series, cutoff_for, load_engine, metrics, parse_time, quantile, settlement_times


def forecast(target="2026-01-02T00:00:00Z", published="2026-01-01T07:30:00Z", mw=100):
    return {"dataset": "WINDFOR", "startTime": target, "publishTime": published, "generation": mw}


def actual(target="2026-01-02T00:00:00Z", published="2026-01-02T00:30:00Z", mw=80):
    return {"dataset": "FUELHH", "fuelType": "WIND", "startTime": target, "publishTime": published, "generation": mw}


def test_cutoff_uses_latest_eligible_forecast_inclusive_and_excludes_future():
    engine = Engine([forecast(mw=50), forecast(published="2026-01-01T09:00:00Z", mw=100),
                     forecast(published="2026-01-01T09:00:01Z", mw=999)], [actual()])
    row = engine.periods(date(2026, 1, 1), "09:00")[0]
    assert row["forecast_mw"] == 100
    assert row["error_mw"] == 20
    assert row["forecast_published_at"] == "2026-01-01T09:00:00Z"


def test_hourly_forecast_is_held_inside_its_hour_but_never_across_a_gap():
    rows = Engine([forecast()], [actual()]).periods(date(2026, 1, 1), "09:00")
    assert [r["forecast_mw"] for r in rows[:4]] == [100, 100, None, None]
    assert rows[0]["actual_mw"] == 80 and rows[1]["actual_mw"] is None
    assert rows[1]["forecast_target_time"] == rows[0]["start_time"]
    assert metrics(rows)["matched_periods"] == 1


def test_zero_values_are_real_observations_and_wape_zero_denominator_is_null():
    rows = Engine([forecast(mw=0)], [actual(mw=0)]).periods(date(2026, 1, 1), "09:00")
    result = metrics(rows)
    assert result["matched_periods"] == 1
    assert result["mae_mw"] == result["rmse_mw"] == result["bias_mw"] == 0
    assert result["wape_pct"] is None


def test_hand_calculated_metrics_and_mw_to_mwh():
    rows = [{"forecast_mw": 120, "actual_mw": 100}, {"forecast_mw": 60, "actual_mw": 100},
            {"forecast_mw": None, "actual_mw": 900}]
    result = metrics(rows)
    assert result["mae_mw"] == 30
    assert result["rmse_mw"] == pytest.approx(math.sqrt(1000))
    assert result["bias_mw"] == -10
    assert result["wape_pct"] == 30
    assert result["shortfall_mwh"] == 10
    assert result["surplus_mwh"] == 20
    assert result["coverage_pct"] == pytest.approx(200 / 3)


def test_empty_metrics_are_not_reported_as_perfect_accuracy():
    result = metrics([])
    assert result["matched_periods"] == 0
    assert result["mae_mw"] is None and result["wape_pct"] is None


def test_energy_requires_complete_day():
    result = Engine([forecast()], [actual()]).decision(date(2026, 1, 1), "09:00")
    assert result["summary"]["forecast_mwh"] is None
    full = [forecast(target=f"2026-01-02T{h:02d}:00:00Z", mw=100) for h in range(24)]
    result = Engine(full, []).decision(date(2026, 1, 1), "09:00")
    assert result["summary"]["forecast_mwh"] == 2400


def test_january_31_decision_delivers_february_1():
    result = Engine([], []).decision(date(2026, 1, 31), "09:00")
    assert result["delivery_date"] == "2026-02-01"
    assert len(result["periods"]) == 48
    assert result["periods"][-1]["start_time"] == "2026-02-01T23:30:00Z"


def test_prior_risk_history_excludes_current_delivery_day_and_future_revisions():
    forecasts = [forecast(), forecast(target="2026-01-03T00:00:00Z", published="2026-01-02T07:30:00Z")]
    actuals = [actual(), actual(published="2026-01-04T10:00:00Z", mw=1),
               actual(target="2026-01-03T00:00:00Z", published="2026-01-03T00:30:00Z", mw=1)]
    engine = Engine(forecasts, actuals)
    # Jan 3 at 09:00: Jan 2 is complete; Jan 3 is not. Jan 4 revision is not known.
    assert engine.history_at(date(2026, 1, 3), "09:00") == [20]
    assert engine.history_at(date(2026, 1, 1), "09:00") == []


def test_future_target_actuals_cannot_change_decision_risk_range():
    forecasts = [forecast(target=f"2026-01-02T{h:02d}:00:00Z") for h in range(24)]
    forecasts += [forecast(target=f"2026-01-04T{h:02d}:00:00Z", published="2026-01-03T07:30:00Z", mw=200) for h in range(24)]
    actuals = [actual(target=t.isoformat(), published=(t + timedelta(minutes=30)).isoformat()) for t in settlement_times(date(2026, 1, 2))]
    first = Engine(forecasts, actuals).decision(date(2026, 1, 3), "09:00")
    future = [actual(target=t.isoformat(), published=(t + timedelta(minutes=30)).isoformat(), mw=9999) for t in settlement_times(date(2026, 1, 4))]
    second = Engine(forecasts, actuals + future).decision(date(2026, 1, 3), "09:00")
    assert first["summary"] == second["summary"]
    assert first["periods"][0]["range_low_mw"] == second["periods"][0]["range_low_mw"] == 180


def test_identical_duplicates_are_collapsed_and_conflicting_ties_fail():
    series = Series([forecast(), forecast()], "WINDFOR")
    assert series.duplicates == 1
    assert len(series.rows[parse_time("2026-01-02T00:00:00Z")]) == 1
    with pytest.raises(ValueError, match="Conflicting"):
        Series([forecast(), forecast(mw=999)], "WINDFOR")


@pytest.mark.parametrize("value", [None, "100", True, -1, float("nan"), float("inf")])
def test_invalid_generation_rejected(value):
    with pytest.raises(ValueError):
        Engine([forecast(mw=value)], [])


def test_wrong_fuel_and_unexpected_forecast_resolution_rejected():
    non_wind = actual(); non_wind["fuelType"] = "BIOMASS"
    with pytest.raises(ValueError, match="non-wind"):
        Engine([], [non_wind])
    with pytest.raises(ValueError, match="hourly"):
        Engine([forecast(target="2026-01-02T00:30:00Z")], [])


def test_naive_timestamps_and_out_of_scope_inputs_rejected():
    with pytest.raises(ValueError, match="timezone"):
        parse_time("2026-01-01T09:00:00")
    for day, cutoff in [(date(2026, 2, 1), "09:00"), (date(2026, 1, 1), "24:00")]:
        with pytest.raises(ValueError):
            cutoff_for(day, cutoff)


def test_settlement_grid_uses_london_day_including_dst():
    assert len(list(settlement_times(date(2026, 3, 29)))) == 46
    assert len(list(settlement_times(date(2026, 10, 25)))) == 50


def test_quantile_interpolation():
    assert quantile([10, 0], .9) == 9
    assert quantile([], .9) is None


def test_shipped_archive_integrity_coverage_and_no_lookahead():
    engine = load_engine()
    for cutoff in ["00:00", "05:00", "09:00", "15:00", "23:59"]:
        result = engine.accuracy(cutoff)
        assert result["metrics"]["expected_periods"] == 1488
        for day in result["daily"]:
            for row in engine.periods(date.fromisoformat(day["decision_date"]), cutoff):
                if row["forecast_published_at"]:
                    assert parse_time(row["forecast_published_at"]) <= parse_time(row["cutoff_at"])
    result = engine.accuracy("09:00")
    assert result["metrics"]["matched_periods"] == 1488
    assert result["metrics"]["mae_mw"] == pytest.approx(2041.9583333333333)
    assert sum(item["count"] for item in result["histogram"]) == 1488
