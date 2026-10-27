import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Info,
  Layers3,
  Leaf,
  LoaderCircle,
  ShieldCheck,
  Wind,
  Zap,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "./api";
import type { Accuracy, Decision, Meta, Period, Revisions } from "./types";

type Tab = "decision" | "accuracy" | "method";
const tabs: { id: Tab; label: string; icon: typeof Wind }[] = [
  { id: "decision", label: "Decision workspace", icon: Wind },
  { id: "accuracy", label: "Forecast accuracy", icon: BarChart3 },
  { id: "method", label: "Data & methodology", icon: Database },
];
const n = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const gw = (value: number | null | undefined) =>
  value == null ? "—" : n(value / 1000, 2);
const signed = (value: number | null | undefined, divisor = 1, digits = 0) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${n(value / divisor, digits)}`;
const dateLabel = (value: string, short = false) =>
  new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "Europe/London",
  });
const stamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      })
    : "Unavailable";
const axis = { fontSize: 11, fill: "#7d8986", fontFamily: "inherit" };
const initial = new URLSearchParams(window.location.search);
const validDate = (value: string) =>
  /^2026-01-(0[1-9]|[12]\d|3[01])$/.test(value);

function MetricCard({
  label,
  value,
  unit,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      <p>{note}</p>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartTip({
  active,
  payload,
  label,
  hindsight = false,
}: {
  active?: boolean;
  payload?: { payload: Period }[];
  label?: string;
  hindsight?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>
        {label} GMT · SP {row.settlement_period}
      </strong>
      <p>
        <span>Forecast</span>
        <b>{n(row.forecast_mw)} MW</b>
      </p>
      {hindsight && (
        <p>
          <span>Actual</span>
          <b>{n(row.actual_mw)} MW</b>
        </p>
      )}
      {hindsight && (
        <p>
          <span>Forecast − actual</span>
          <b>{signed(row.error_mw)} MW</b>
        </p>
      )}
      <small>Published {stamp(row.forecast_published_at)} GMT</small>
      {row.range_low_mw != null && (
        <small>
          Historical range: {n(row.range_low_mw)}–{n(row.range_high_mw)} MW
        </small>
      )}
    </div>
  );
}

function PeriodTable({
  rows,
  hindsight,
  compact = false,
  onSelect,
}: {
  rows: Period[];
  hindsight: boolean;
  compact?: boolean;
  onSelect?: (day: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{compact ? "Delivery period" : "Time · GMT"}</th>
            <th>Forecast</th>
            {hindsight && (
              <>
                <th>Actual</th>
                <th>Error</th>
              </>
            )}
            <th>Published · GMT</th>
            <th>{compact ? "Review" : "Lead time"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.start_time}>
              <td>
                <strong>
                  {compact ? `${dateLabel(row.start_time, true)} · ` : ""}
                  {row.time}
                </strong>
                {!compact && (
                  <span className="table-sub">
                    SP {String(row.settlement_period).padStart(2, "0")}
                  </span>
                )}
              </td>
              <td>
                {n(row.forecast_mw)} <span className="unit">MW</span>
              </td>
              {hindsight && (
                <>
                  <td>
                    {n(row.actual_mw)} <span className="unit">MW</span>
                  </td>
                  <td
                    className={
                      (row.error_mw ?? 0) > 0 ? "text-amber" : "text-purple"
                    }
                  >
                    {signed(row.error_mw)} <span className="unit">MW</span>
                  </td>
                </>
              )}
              <td className="muted">{stamp(row.forecast_published_at)}</td>
              <td>
                {onSelect ? (
                  <button
                    className="icon-button"
                    aria-label={`Review decision on ${row.decision_date}`}
                    onClick={() => onSelect(row.decision_date)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                ) : (
                  `${n(row.lead_hours, 1)} h`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevisionPanel({ day, cutoff }: { day: string; cutoff: string }) {
  const [hour, setHour] = useState(12);
  const query = new URLSearchParams({
    decision_date: day,
    cutoff,
    hour: String(hour),
  });
  const { data, error, loading } = useApi<Revisions>(`/api/revisions?${query}`);
  return (
    <Panel
      title="Follow a forecast"
      subtitle="Every available issue for one delivery hour."
      action={
        <label className="sr-only-label">
          Delivery hour
          <select
            aria-label="Delivery hour"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {String(i).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="revision-list" aria-live="polite">
        {loading ? (
          <p className="muted">Loading publication history…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : data?.revisions.length ? (
          data.revisions.slice(-6).map((row) => (
            <div
              className={`revision ${row.selected ? "selected" : ""}`}
              key={row.publish_time}
            >
              <span className="revision-dot">
                {row.selected && <Check size={10} />}
              </span>
              <div>
                <strong>{stamp(row.publish_time)}</strong>
                <small>
                  {row.selected
                    ? "Latest before cutoff"
                    : "Earlier publication"}
                </small>
              </div>
              <b>
                {gw(row.generation_mw)} <span>GW</span>
              </b>
            </div>
          ))
        ) : (
          <p className="muted">No publication available before this cutoff.</p>
        )}
      </div>
      <p className="panel-foot">
        Showing up to six most recent issues available at the decision time.
      </p>
    </Panel>
  );
}

function DecisionView({
  data,
  day,
  cutoff,
  onTab,
}: {
  data: Decision;
  day: string;
  cutoff: string;
  onTab: (tab: Tab) => void;
}) {
  const [hindsight, setHindsight] = useState(false);
  const [range, setRange] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const summary = data.summary;
  const chart = data.periods.map((row) => ({
    ...row,
    band:
      row.range_low_mw == null ? null : [row.range_low_mw, row.range_high_mw],
  }));
  const fullForecast =
    data.metrics.forecast_periods === data.metrics.expected_periods;
  return (
    <>
      <div className="context-strip">
        <span>
          <CalendarDays size={15} />
          Delivery <strong>{dateLabel(data.delivery_date, true)}</strong>
        </span>
        <span>
          <Clock3 size={15} />
          As of{" "}
          <strong>
            {cutoff} GMT · {dateLabel(day, true)}
          </strong>
        </span>
        <span className="context-last">
          <ShieldCheck size={15} />
          Publication cutoff enforced
        </span>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="Average wind forecast"
          value={gw(summary.mean_forecast_mw)}
          unit="GW"
          note="Mean across available delivery periods"
          icon={<Wind size={18} />}
          accent
        />
        <MetricCard
          label="Forecast wind energy"
          value={gw(summary.forecast_mwh)}
          unit="GWh"
          note={
            fullForecast
              ? "Full day · 48 half-hour periods"
              : "Unavailable until the full day is covered"
          }
          icon={<Zap size={18} />}
        />
        <MetricCard
          label="Prior forecast error"
          value={gw(summary.historical_mae_mw)}
          unit="GW"
          note={`MAE · ${n(summary.history_periods)} prior half-hours`}
          icon={<Activity size={18} />}
        />
        <MetricCard
          label="Forecast coverage"
          value={`${data.metrics.forecast_periods}/${data.metrics.expected_periods}`}
          note={`${summary.publications.length} publication vintage${summary.publications.length !== 1 ? "s" : ""} selected`}
          icon={<Layers3 size={18} />}
        />
      </div>
      {data.warnings.length > 0 && (
        <div className="notice" role="status">
          <Info size={18} />
          <div>
            {data.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}
      <div className="outlook-layout">
        <Panel
          title="The day ahead"
          subtitle={`Wind generation for ${dateLabel(data.delivery_date)} · Great Britain`}
          className="profile-panel"
          action={
            <span className="tag">
              <span className="status-dot" />
              {fullForecast ? "Complete forecast" : "Partial forecast"}
            </span>
          }
        >
          <div className="chart-controls">
            <div className="legend">
              <span>
                <i className="line-key teal" />
                Available forecast
              </span>
              {hindsight && (
                <span>
                  <i className="line-key purple" />
                  Actual generation
                </span>
              )}
              {range && summary.history_periods >= 48 && (
                <span>
                  <i className="area-key" />
                  Historical error range
                </span>
              )}
            </div>
            <span className="chart-unit">GW</span>
          </div>
          <div
            className="profile-chart"
            role="img"
            aria-label="Hourly forecast aligned to half-hour delivery periods; exact values available in the period audit below."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chart}
                margin={{ top: 12, right: 12, bottom: 0, left: -18 }}
              >
                <CartesianGrid
                  stroke="#e7edeb"
                  strokeDasharray="3 5"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  ticks={[
                    "00:00",
                    "04:00",
                    "08:00",
                    "12:00",
                    "16:00",
                    "20:00",
                    "23:30",
                  ]}
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={22}
                  dy={9}
                />
                <YAxis
                  tickFormatter={(v) => n(Number(v) / 1000, 0)}
                  tick={axis}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  content={<ChartTip hindsight={hindsight} />}
                  cursor={{ stroke: "#92a9a0", strokeDasharray: "4 4" }}
                />
                {range && (
                  <Area
                    dataKey="band"
                    name="Historical range"
                    type="stepAfter"
                    fill="#d9e8dd"
                    stroke="none"
                    fillOpacity={0.7}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                <Line
                  dataKey="forecast_mw"
                  type="stepAfter"
                  stroke="#137765"
                  strokeWidth={2.6}
                  dot={false}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {hindsight && (
                  <Line
                    dataKey="actual_mw"
                    type="linear"
                    stroke="#8b78b3"
                    strokeWidth={2.2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="profile-options">
            <label className="toggle">
              <input
                type="checkbox"
                checked={hindsight}
                onChange={(e) => setHindsight(e.target.checked)}
              />
              <span className="switch" />
              Show actuals <small>hindsight</small>
            </label>
            <label className="toggle range-toggle">
              <input
                type="checkbox"
                checked={range}
                onChange={(e) => setRange(e.target.checked)}
              />
              <span className="switch" />
              Historical range
            </label>
          </div>
          <div className="chart-note">
            <Info size={15} />
            <p>
              {hindsight
                ? "Actuals are shown for retrospective review; they were not available for this purchase decision. "
                : ""}
              The shaded range uses the 10th–90th percentiles of prior completed
              days’ errors. It is descriptive, with no guaranteed coverage.
            </p>
          </div>
        </Panel>
        <aside className="risk-panel">
          <div className="risk-kicker">
            <span className="risk-icon">
              <ShieldCheck size={21} />
            </span>
            Decision context
          </div>
          <h2>
            Leave room for
            <br />
            forecast error.
          </h2>
          <p>
            Wind falling below forecast increases the energy that must come from
            other sources.
          </p>
          <div className="risk-number">
            <small>Prior P90 wind shortfall</small>
            <strong>
              {gw(summary.historical_p90_shortfall_mw)} <span>GW</span>
            </strong>
          </div>
          <p className="risk-detail">
            {summary.history_periods >= 48
              ? `A historical stress reference from ${n(summary.history_periods)} half-hours known before this cutoff. It is not an optimised purchase volume.`
              : "At least 48 prior completed half-hours are needed. Early January has limited history."}
          </p>
          <div className="risk-divider" />
          <div className="risk-row">
            <span>Forecast published</span>
            <b>
              {summary.publications.length === 1
                ? `${summary.publications[0].slice(11, 16)} GMT`
                : `${summary.publications.length} vintages`}
            </b>
          </div>
          <div className="risk-row">
            <span>Oldest issue at cutoff</span>
            <b>{n(summary.max_forecast_age_hours, 1)} h</b>
          </div>
          <button className="risk-link" onClick={() => onTab("accuracy")}>
            Explore January accuracy <ArrowRight size={16} />
          </button>
        </aside>
      </div>
      <div className="detail-layout">
        <Panel
          title="Period audit"
          subtitle="Trace each value back to its original publication."
          action={
            <button
              className="text-button"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show fewer" : "View all 48"}{" "}
              <ArrowUpRight size={15} />
            </button>
          }
        >
          <PeriodTable
            rows={expanded ? data.periods : data.periods.slice(0, 6)}
            hindsight={hindsight}
          />
          <p className="panel-foot">
            Hourly WINDFOR values are held constant within each hour. Actuals
            remain half-hourly.
          </p>
        </Panel>
        <RevisionPanel day={day} cutoff={cutoff} />
      </div>
      <div className="scope-note">
        <Leaf size={18} />
        <p>
          <strong>Wind intelligence, within scope.</strong> This pilot uses
          Elexon’s metered GB wind only. Calculating your utility’s purchase
          volume also needs customer demand and contracted supply, which are
          outside this dataset.
        </p>
      </div>
    </>
  );
}

function AccuracyView({
  data,
  onDay,
}: {
  data: Accuracy;
  onDay: (day: string) => void;
}) {
  const m = data.metrics;
  const daily = data.daily.map((row) => ({
    ...row,
    label: row.decision_date.slice(8),
  }));
  const histogram = data.histogram.map((row) => ({
    ...row,
    label: `${n(row.from_mw / 1000, 1)}`,
  }));
  return (
    <>
      <div className="context-strip">
        <span>
          <CalendarDays size={15} />
          <strong>1–31 January decisions</strong>
        </span>
        <span>2 Jan–1 Feb delivery</span>
        <span className="context-last">
          <CheckCircle2 size={15} />
          {n(m.matched_periods)} / {n(m.expected_periods)} matched half-hours
        </span>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="Mean absolute error"
          value={gw(m.mae_mw)}
          unit="GW"
          note="Average size of the forecast miss"
          icon={<Activity size={18} />}
          accent
        />
        <MetricCard
          label="Root mean square error"
          value={gw(m.rmse_mw)}
          unit="GW"
          note="Gives larger misses more weight"
          icon={<BarChart3 size={18} />}
        />
        <MetricCard
          label="Signed forecast bias"
          value={signed(m.bias_mw, 1000, 2)}
          unit="GW"
          note="Positive = forecast exceeds actual"
          icon={<ArrowUpRight size={18} />}
        />
        <MetricCard
          label="Weighted absolute error"
          value={n(m.wape_pct, 1)}
          unit="%"
          note="Total absolute error / total actual wind"
          icon={<Layers3 size={18} />}
        />
      </div>
      <div className="analysis-insight">
        <span className="insight-icon">
          <Info size={20} />
        </span>
        <p>
          <strong>
            Wind was overforecast in {n(m.overforecast_pct, 1)}% of matched
            periods.
          </strong>{" "}
          Positive error means less wind arrived than forecast. These are
          retrospective results for the full month at the {data.cutoff} cutoff.
        </p>
        <span className="tag amber">Historical evaluation</span>
      </div>
      <Panel
        title="Where did forecasts miss?"
        subtitle="Daily mean absolute error · select a decision day to inspect its delivery profile."
        action={<span className="chart-unit">GW · lower is better</span>}
      >
        <div
          className="daily-chart"
          role="img"
          aria-label="Daily forecast error; use the decision day buttons below to explore exact values."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={daily}
              margin={{ top: 12, right: 14, bottom: 0, left: -18 }}
            >
              <CartesianGrid
                stroke="#e7edeb"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={axis}
                tickLine={false}
                axisLine={false}
                dy={8}
              />
              <YAxis
                tickFormatter={(v) => n(Number(v) / 1000, 1)}
                tick={axis}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "#f1f5f2" }}
                formatter={(value) => [
                  `${gw(Number(value))} GW`,
                  "Mean absolute error",
                ]}
                labelFormatter={(label) => `Decision ${label} January`}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #dce5e0",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="mae_mw"
                radius={[4, 4, 0, 0]}
                maxBarSize={25}
                isAnimationActive={false}
                onClick={(_, index) => onDay(daily[index].decision_date)}
                style={{ cursor: "pointer" }}
              >
                {daily.map((row) => (
                  <Cell
                    key={row.decision_date}
                    fill={
                      (row.mae_mw ?? 0) > (m.mae_mw ?? 0)
                        ? "#d6a961"
                        : "#247c69"
                    }
                  />
                ))}
              </Bar>
              <ReferenceLine
                y={m.mae_mw ?? 0}
                stroke="#61766b"
                strokeDasharray="4 4"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="day-buttons" aria-label="Review decision days">
          {daily.map((row) => (
            <button
              key={row.decision_date}
              onClick={() => onDay(row.decision_date)}
              title={`${dateLabel(row.decision_date)} · MAE ${gw(row.mae_mw)} GW`}
              aria-label={`Review ${dateLabel(row.decision_date)}, mean absolute error ${gw(row.mae_mw)} gigawatts`}
            >
              {row.label}
            </button>
          ))}
        </div>
        <p className="panel-foot">
          Dashed line: monthly MAE. Amber bars exceed that average. All days use
          the same publication cutoff.
        </p>
      </Panel>
      <div className="two-column">
        <Panel
          title="Direction of error"
          subtitle="Forecast minus actual · distribution of half-hours."
        >
          <div className="small-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histogram}
                margin={{ top: 10, right: 10, bottom: 10, left: -22 }}
              >
                <CartesianGrid
                  stroke="#e7edeb"
                  strokeDasharray="3 5"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis tick={axis} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value) => [n(Number(value)), "Half-hours"]}
                  labelFormatter={(label) =>
                    `Error ${label} to ${n(Number(label) + 0.5, 1)} GW`
                  }
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #dce5e0",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  isAnimationActive={false}
                  radius={[3, 3, 0, 0]}
                >
                  {histogram.map((row) => (
                    <Cell
                      key={row.from_mw}
                      fill={row.from_mw < 0 ? "#a99ac4" : "#d6a961"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="split-legend">
            <span>
              <i className="dot purple" />
              Negative · extra wind
            </span>
            <span>
              <i className="dot amber" />
              Positive · wind shortfall
            </span>
          </div>
        </Panel>
        <Panel
          title="Error through the delivery day"
          subtitle="Mean absolute error by delivery hour · GMT."
        >
          <div className="small-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.hourly}
                margin={{ top: 10, right: 16, bottom: 10, left: -20 }}
              >
                <CartesianGrid
                  stroke="#e7edeb"
                  strokeDasharray="3 5"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  tickFormatter={(v) => n(Number(v) / 1000, 1)}
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value) => [
                    `${gw(Number(value))} GW`,
                    "Mean absolute error",
                  ]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #dce5e0",
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="mae_mw"
                  fill="#e3eee5"
                  stroke="#247c69"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="panel-foot">
            Each hour contains up to 62 matched half-hours. This is a
            descriptive pattern, not a causal explanation.
          </p>
        </Panel>
      </div>
      <Panel
        title="Largest individual misses"
        subtitle="Ranked by absolute error. Open a decision to review its forecast vintage."
      >
        <PeriodTable
          rows={data.worst_periods}
          hindsight
          compact
          onSelect={onDay}
        />
      </Panel>
      <div className="scope-note">
        <Info size={18} />
        <p>
          Errors compare available forecasts with the actuals in the retrieved
          archive. Curtailment, revisions and dataset coverage can affect the
          gap; these two datasets alone cannot explain its causes or quantify
          trading profit.
        </p>
      </div>
    </>
  );
}

function MethodView({ meta, accuracy }: { meta: Meta; accuracy: Accuracy }) {
  return (
    <>
      <div className="method-intro">
        <div>
          <span className="eyebrow">A reproducible decision replay</span>
          <h2>Every number has a trail.</h2>
          <p>
            A fixed, checksummed Elexon archive makes this pilot reproducible
            and keeps it available even when the upstream API is slow.
          </p>
        </div>
        <div className="integrity-badge">
          <ShieldCheck size={27} />
          <strong>
            {meta.checksums_verified ? "Integrity verified" : "Not verified"}
          </strong>
          <span>SHA-256 source checks</span>
        </div>
      </div>
      <div className="method-steps">
        <article>
          <span>01</span>
          <h3>Freeze the decision</h3>
          <p>
            Pick a January decision date and a London cutoff. Delivery is the
            following calendar day. January uses GMT, the same offset as UTC.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>Select what was available</h3>
          <p>
            For every delivery hour, choose the latest WINDFOR publication at or
            before that cutoff. Retain its publication time in every aligned
            half-hour.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Measure the outcome</h3>
          <p>
            Join FUELHH wind actuals by delivery time. Score only matched
            periods, display coverage, and preserve missing values as missing.
          </p>
        </article>
      </div>
      <div className="two-column">
        <Panel
          title="The data contract"
          subtitle="Only the two sources in the brief feed the analysis."
        >
          <dl className="definition-list">
            <div>
              <dt>Forecasts</dt>
              <dd>WINDFOR · hourly in this archive</dd>
            </div>
            <div>
              <dt>Actuals</dt>
              <dd>FUELHH · WIND · half-hour average MW</dd>
            </div>
            <div>
              <dt>Decision window</dt>
              <dd>1–31 January 2026, inclusive</dd>
            </div>
            <div>
              <dt>Delivery window</dt>
              <dd>2 January–1 February 2026, inclusive</dd>
            </div>
            <div>
              <dt>Alignment</dt>
              <dd>Hold each hourly forecast across its two half-hours</dd>
            </div>
            <div>
              <dt>Energy</dt>
              <dd>MW × 0.5 hours = MWh per period</dd>
            </div>
            <div>
              <dt>Matched coverage</dt>
              <dd>
                {n(accuracy.metrics.matched_periods)} /{" "}
                {n(accuracy.metrics.expected_periods)} at {accuracy.cutoff}
              </dd>
            </div>
            <div>
              <dt>Retrieved</dt>
              <dd>{stamp(meta.manifest.retrieved_at)} GMT</dd>
            </div>
          </dl>
        </Panel>
        <Panel
          title="How to read the metrics"
          subtitle="Error e = forecast − actual, in MW."
        >
          <div className="formula-list">
            <div>
              <b>MAE</b>
              <p>Mean of |e|. The typical magnitude of a miss.</p>
            </div>
            <div>
              <b>RMSE</b>
              <p>Square root of mean e². More sensitive to large misses.</p>
            </div>
            <div>
              <b>Bias</b>
              <p>
                Mean e. Positive means overforecast wind and potential
                shortfall.
              </p>
            </div>
            <div>
              <b>WAPE</b>
              <p>
                100 × Σ|e| / Σactual, over matched periods. Undefined when the
                actual total is zero.
              </p>
            </div>
            <div>
              <b>P90 shortfall</b>
              <p>
                Max(0, 90th percentile of signed errors), using only prior
                completed delivery days whose actuals were published by the
                selected cutoff.
              </p>
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="Source archive"
        subtitle={`${meta.manifest.requests.length} recorded API requests · full request URLs and hashes are available in the API metadata.`}
        action={
          <a
            className="text-button"
            href="/api/meta"
            target="_blank"
            rel="noreferrer"
          >
            View metadata <ExternalLink size={14} />
          </a>
        }
      >
        <div className="source-cards">
          {Object.entries(meta.manifest.datasets).map(([name, info]) => (
            <article key={name}>
              <div className="source-card-top">
                <span className="source-symbol">
                  <Database size={18} />
                </span>
                <h3>{name}</h3>
                <span className="tag">{n(info.rows)} rows</span>
              </div>
              <p>
                {name === "WINDFOR"
                  ? "Publication history includes a two-day December lookback for early January decisions."
                  : "January actuals plus 1 February delivery. 1 January supports historical context."}
              </p>
              <small>SHA-256</small>
              <code>{info.sha256}</code>
            </article>
          ))}
        </div>
        <div className="source-links">
          {meta.sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.label}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
      </Panel>
      <div className="two-column">
        <Panel title="Assumptions made explicit">
          <ul className="method-list">
            <li>
              The default 09:00 cutoff is a configurable pilot policy. It is not
              a claim about every exchange’s gate closure.
            </li>
            <li>
              Forecast publication time is the available proxy for knowledge
              time. Actual receipt latency is not supplied.
            </li>
            <li>
              The hourly forecast is treated as constant within its hour. No
              linear interpolation or filling across missing hours is used.
            </li>
            <li>
              The empirical range uses prior January errors with a minimum of 48
              half-hours. Correlated errors and a short history limit its
              interpretation.
            </li>
          </ul>
        </Panel>
        <Panel title="What this pilot can establish">
          <ul className="method-list">
            <li>
              It reconstructs forecasts available for a national GB metered-wind
              decision and quantifies their historical error.
            </li>
            <li>
              It does not cover all UK renewable generation, embedded wind,
              solar, customer demand, prices or contracted positions.
            </li>
            <li>
              It does not translate national wind into your utility’s thermal
              procurement requirement or claim financial savings.
            </li>
            <li>
              Actuals are the archived values retrieved now; publication
              filtering cannot reconstruct unreported historical corrections.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>(
    (["decision", "accuracy", "method"].includes(initial.get("tab") ?? "")
      ? initial.get("tab")
      : "decision") as Tab,
  );
  const [day, setDay] = useState(
    validDate(initial.get("date") ?? "") ? initial.get("date")! : "2026-01-15",
  );
  const [cutoff, setCutoff] = useState(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(initial.get("cutoff") ?? "")
      ? initial.get("cutoff")!
      : "09:00",
  );
  const [retry, setRetry] = useState(0);
  const decisionQuery = new URLSearchParams({ decision_date: day, cutoff });
  const meta = useApi<Meta>("/api/meta", retry);
  const decision = useApi<Decision>(`/api/decision?${decisionQuery}`, retry);
  const accuracy = useApi<Accuracy>(
    `/api/accuracy?${new URLSearchParams({ cutoff })}`,
    retry,
  );
  const busy =
    meta.loading || (tab === "decision" ? decision.loading : accuracy.loading);
  const error =
    meta.error || (tab === "decision" ? decision.error : accuracy.error);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `?${new URLSearchParams({ date: day, cutoff, tab })}`,
    );
  }, [day, cutoff, tab]);
  function reviewDay(value: string) {
    setDay(value);
    setTab("decision");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function shiftDay(offset: number) {
    const value = new Date(`${day}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    const next = value.toISOString().slice(0, 10);
    if (validDate(next)) setDay(next);
  }
  const exportQuery = new URLSearchParams({
    decision_date: day,
    cutoff,
    scope: tab === "decision" ? "day" : "month",
  });
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="?tab=decision" aria-label="Wind Desk home">
          <span className="brand-icon">
            <Wind size={27} strokeWidth={1.6} />
          </span>
          <span>
            wind<span className="brand-light">desk</span>
            <small>DAY-AHEAD INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          WORKSPACE<span>01</span>
        </div>
        <nav aria-label="Main navigation">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {tab === item.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-archive">
          <span className="eyebrow">PILOT ARCHIVE</span>
          <h3>January 2026</h3>
          <p>
            31 decision days.
            <br />
            One transparent view.
          </p>
          <div className="archive-mini">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="sidebar-tag">
            <span className="status-dot" />
            Elexon data
          </span>
        </div>
        <div className="sidebar-bottom">
          <div className="gb-mark">GB</div>
          <div>
            <strong>Great Britain</strong>
            <small>National metered wind</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{tabs.find((item) => item.id === tab)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="replay-badge">
              <Clock3 size={13} />
              Historical replay
            </span>
            <span className="topbar-divider" />
            <span className="timezone">Europe/London</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-rule" />
                WIND INTELLIGENCE / JANUARY 2026
              </div>
              <h1>
                {tab === "decision"
                  ? "Day-ahead wind outlook"
                  : tab === "accuracy"
                    ? "Understand the forecast error"
                    : "Built on traceable data"}
              </h1>
              <p>
                {tab === "decision"
                  ? "The forecast available at your decision time, with the context to use it."
                  : tab === "accuracy"
                    ? "A consistent, publication-aware backtest of January purchase decisions."
                    : "The sources, calculations and limits behind every view."}
              </p>
            </div>
            <a
              className="export-button"
              href={`/api/export.csv?${exportQuery}`}
              download
            >
              <ArrowDownToLine size={16} />
              Export {tab === "decision" ? "day" : "month"}
            </a>
          </div>
          <div className="filter-bar">
            <div className="filter-label">
              <CalendarDays size={17} />
              <span>
                {tab === "decision" ? "Decision date" : "Decision window"}
              </span>
            </div>
            {tab === "decision" ? (
              <div className="date-control">
                <button
                  aria-label="Previous decision day"
                  className="icon-button"
                  disabled={day === "2026-01-01"}
                  onClick={() => shiftDay(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  aria-label="Decision date"
                  type="date"
                  min="2026-01-01"
                  max="2026-01-31"
                  value={day}
                  onInput={(e) => {
                    if (validDate(e.currentTarget.value))
                      setDay(e.currentTarget.value);
                  }}
                  onChange={(e) => {
                    if (validDate(e.target.value)) setDay(e.target.value);
                  }}
                />
                <button
                  aria-label="Next decision day"
                  className="icon-button"
                  disabled={day === "2026-01-31"}
                  onClick={() => shiftDay(1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <span className="window-label">1–31 January 2026</span>
            )}
            <span className="filter-divider" />
            <label className="cutoff-label" htmlFor="cutoff">
              <Clock3 size={16} />
              Decision cutoff
            </label>
            <input
              id="cutoff"
              type="time"
              value={cutoff}
              onInput={(e) => {
                if (e.currentTarget.validity.valid && e.currentTarget.value)
                  setCutoff(e.currentTarget.value);
              }}
              onChange={(e) => {
                if (e.target.validity.valid && e.target.value)
                  setCutoff(e.target.value);
              }}
            />
            <span className="timezone">GMT</span>
            <div className="filter-end">
              <span className="status-dot" />
              {busy ? "Loading archive" : "Fixed Elexon archive"}
            </div>
          </div>
          {busy ? (
            <div className="loading" role="status">
              <LoaderCircle className="spinner" size={26} />
              <h2>Replaying the decision…</h2>
              <p>Selecting the publications available at {cutoff} GMT.</p>
            </div>
          ) : error ? (
            <div className="error-state" role="alert">
              <Info size={28} />
              <h2>The archive could not be loaded</h2>
              <p>{error}</p>
              <button
                className="export-button"
                onClick={() => setRetry(retry + 1)}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="view-content">
              {tab === "decision" && decision.data && (
                <DecisionView
                  data={decision.data}
                  day={day}
                  cutoff={cutoff}
                  onTab={setTab}
                />
              )}
              {tab === "accuracy" && accuracy.data && (
                <AccuracyView data={accuracy.data} onDay={reviewDay} />
              )}
              {tab === "method" && meta.data && accuracy.data && (
                <MethodView meta={meta.data} accuracy={accuracy.data} />
              )}
            </div>
          )}
          <footer>
            <span>
              winddesk <i />
              January 2026 pilot
            </span>
            <button onClick={() => setTab("method")}>
              <BookOpen size={13} />
              Sources & methodology <ArrowUpRight size={12} />
            </button>
            <span>Powered by Elexon Insights</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
