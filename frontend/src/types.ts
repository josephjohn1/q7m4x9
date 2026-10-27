export type Metric = {
  expected_periods: number;
  matched_periods: number;
  forecast_periods: number;
  actual_periods: number;
  coverage_pct: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  wape_pct: number | null;
  p90_abs_error_mw: number | null;
  overforecast_pct: number | null;
  shortfall_mwh: number | null;
  surplus_mwh: number | null;
};
export type Period = {
  decision_date: string;
  cutoff_at: string;
  start_time: string;
  time: string;
  settlement_period: number;
  forecast_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  forecast_published_at: string | null;
  forecast_target_time: string | null;
  actual_published_at: string | null;
  lead_hours: number | null;
  range_low_mw?: number | null;
  range_high_mw?: number | null;
};
export type Decision = {
  decision_date: string;
  delivery_date: string;
  cutoff_at: string;
  cutoff: string;
  timezone: string;
  periods: Period[];
  metrics: Metric;
  warnings: string[];
  summary: {
    mean_forecast_mw: number | null;
    forecast_mwh: number | null;
    min_forecast_mw: number | null;
    max_forecast_mw: number | null;
    publications: string[];
    max_forecast_age_hours: number | null;
    history_periods: number;
    historical_mae_mw: number | null;
    historical_p90_shortfall_mw: number | null;
  };
};
export type Accuracy = {
  cutoff: string;
  metrics: Metric;
  daily: (Metric & { decision_date: string; delivery_date: string })[];
  hourly: (Metric & { hour: string })[];
  histogram: { from_mw: number; to_mw: number; count: number }[];
  worst_periods: Period[];
};
export type Meta = {
  manifest: {
    retrieved_at: string;
    provider: string;
    decision_dates: { from: string; to: string };
    delivery_dates: { from: string; to: string };
    datasets: Record<
      string,
      {
        file: string;
        rows: number;
        sha256: string;
        start_time_min: string;
        start_time_max: string;
        publish_time_min: string;
        publish_time_max: string;
      }
    >;
    requests: { url: string; rows: number }[];
  };
  decision_dates: string[];
  checksums_verified: boolean;
  sources: { label: string; url: string }[];
};
export type Revisions = {
  target_time: string;
  cutoff_at: string;
  revisions: {
    publish_time: string;
    generation_mw: number;
    selected: boolean;
  }[];
};
