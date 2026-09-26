"use client";

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionsByMethodRow } from "@aabhushan/contracts";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { formatInr, formatInrCompact, isPositiveMoney, isZeroMoney } from "@/lib/money";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-methods";
import { kolkataTodayCalendar, type PeriodPreset } from "@/lib/period-bounds";
import { cx } from "@/utils/cx";

import {
  CHART_ACCENT,
  CHART_ACCENT_TEXT,
  CHART_GRID,
  CHART_HATCH_LIGHT,
  CHART_INK,
  collectedPercent,
  enumerateDates,
  formatDashboardDayLabel,
  formatDayOfMonth,
  formatShortWeekdayDay,
  mergeTrendPoints,
  periodDueFromSalesCollections,
  type TrendPoint,
} from "./dashboard-shared";

type ChartDayPoint = {
  business_date: string;
  dayLabel: string;
  isToday: boolean;
  isFuture: boolean;
  net_sales_inr: number | null;
  net_collected_inr: number | null;
};

function buildCalendarSeries(
  salesByDate: { business_date: string; net_sales_inr: string }[] | undefined,
  collectionsByDate: { business_date: string; net_collected_inr: string }[] | undefined,
  spanFrom: string,
  spanTo: string,
): ChartDayPoint[] {
  const merged = mergeTrendPoints(salesByDate, collectionsByDate);
  const byDate = new Map(merged.map((point) => [point.business_date, point]));
  const today = kolkataTodayCalendar().toString();
  return enumerateDates(spanFrom, spanTo).map((date) => {
    const point = byDate.get(date);
    return {
      business_date: date,
      dayLabel: formatDayOfMonth(date),
      isToday: date === today,
      isFuture: date > today,
      net_sales_inr: point?.net_sales_inr ?? null,
      net_collected_inr: point?.net_collected_inr ?? null,
    };
  });
}

function datesWithDataCount(points: ChartDayPoint[]): number {
  return points.filter(
    (point) => point.net_sales_inr !== null || point.net_collected_inr !== null,
  ).length;
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartDayPoint;
};

function SalesBarShape(props: BarShapeProps): ReactNode {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || payload.net_sales_inr === null || height <= 0 || width <= 0) {
    return null;
  }
  return <rect x={x} y={y} width={Math.max(width, 1)} height={height} fill={CHART_INK} />;
}

function makeCollectionsBarShape(hatchId: string) {
  return function CollectionsBarShape(props: BarShapeProps): ReactNode {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    if (!payload || payload.net_collected_inr === null || height <= 0 || width <= 0) {
      return null;
    }
    return (
      <rect
        x={x}
        y={y}
        width={Math.max(width, 1)}
        height={height}
        fill={`url(#${hatchId})`}
        stroke={CHART_ACCENT}
        strokeWidth={1.5}
      />
    );
  };
}

function DayCalloutBox({
  point,
  className,
}: {
  point: ChartDayPoint;
  className?: string;
}): ReactNode {
  const salesLabel =
    point.net_sales_inr === null ? "—" : formatInr(point.net_sales_inr.toFixed(2));
  const collectedLabel =
    point.net_collected_inr === null ? "—" : formatInr(point.net_collected_inr.toFixed(2));
  const shortDate = formatShortWeekdayDay(point.business_date);
  const title = point.isToday ? `${shortDate} · today` : shortDate;
  return (
    <div
      className={cx(
        "border border-primary bg-primary px-2.5 py-1.5 text-xs shadow-xs",
        className,
      )}
    >
      <p className="font-bold text-primary">{title}</p>
      <p className="text-primary">Sales {salesLabel}</p>
      <p style={{ color: CHART_ACCENT_TEXT }}>Collected {collectedLabel}</p>
    </div>
  );
}

export function MethodSplitBar({
  rows,
}: {
  rows: CollectionsByMethodRow[];
}): ReactNode {
  const byMethod = new Map(rows.map((row) => [row.method, row]));
  const total = rows.reduce((sum, row) => sum + Number(row.net_collected_inr), 0);
  const segments = PAYMENT_METHODS.map((method) => {
    const row = byMethod.get(method);
    const amount = row?.net_collected_inr ?? "0.00";
    const value = Number(amount);
    const share = total > 0 ? value / total : 0;
    return { method, amount, share, positive: isPositiveMoney(amount) };
  });
  const positive = segments.filter((segment) => segment.positive);
  const zero = segments.filter((segment) => !segment.positive);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 overflow-hidden border border-primary">
        {total <= 0 ? (
          <span className="flex-1 bg-secondary" />
        ) : (
          positive.map((segment) => (
            <span
              key={segment.method}
              className="bg-primary-solid"
              style={{ flex: Math.max(segment.share, 0.02) }}
              title={`${paymentMethodLabel(segment.method)} ${formatInr(segment.amount)}`}
            />
          ))
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-tertiary">
        <span className="flex flex-wrap gap-x-3">
          {positive.length === 0 ? (
            <span>No collections in this period</span>
          ) : (
            positive.map((segment) => {
              const pct = total > 0 ? Math.round(segment.share * 100) : 0;
              return (
                <span key={segment.method}>
                  <strong className="text-primary">{paymentMethodLabel(segment.method)}</strong>{" "}
                  {formatInr(segment.amount)} · {String(pct)}%
                </span>
              );
            })
          )}
        </span>
        {zero.length > 0 ? (
          <span className="text-quaternary">
            {zero.map((segment) => `${paymentMethodLabel(segment.method)} —`).join(" · ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function TodaySalesCollectionsPanel({
  salesInr,
  collectionsInr,
  collectionsByMethod,
}: {
  salesInr: string | undefined;
  collectionsInr: string | undefined;
  collectionsByMethod: CollectionsByMethodRow[] | undefined;
}): ReactNode {
  const sales = salesInr ?? "0.00";
  const collections = collectionsInr ?? "0.00";
  const pct = collectedPercent(sales, collections);
  const due = periodDueFromSalesCollections(sales, collections);
  const hasDue = isPositiveMoney(due);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-primary px-3 py-2">
        <h2 className="text-sm font-bold text-primary">Sales vs collections · today</h2>
        <ul className="ml-auto flex flex-wrap items-center gap-3 text-xs text-tertiary">
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 border-t-[2.5px] border-primary" aria-hidden />
            Sales
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 border-t-[2.5px] border-dashed"
              style={{ borderColor: CHART_ACCENT }}
              aria-hidden
            />
            Collections
          </li>
        </ul>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {pct !== null ? (
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-display-xs font-bold tabular-nums text-primary">{String(pct)}%</span>
            <span className="text-xs text-tertiary">
              of today&apos;s sales collected
              {hasDue ? <> · {formatInr(due)} still due</> : null}
            </span>
          </p>
        ) : (
          <p className="text-xs text-tertiary">No sales today yet.</p>
        )}
        <p className="text-xs text-quaternary">
          Intraday chart is unavailable. Totals and payment methods are for the whole day.
        </p>
        <div className="mt-auto">
          {collectionsByMethod ? <MethodSplitBar rows={collectionsByMethod} /> : null}
        </div>
      </div>
    </div>
  );
}

function CompactPeriodSummary({
  points,
  showSales,
  showCollections,
}: {
  points: TrendPoint[];
  showSales: boolean;
  showCollections: boolean;
}): ReactNode {
  const point = points[0];
  if (!point) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-sm text-tertiary">{formatDashboardDayLabel(point.business_date)}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {showSales ? (
          <div>
            <dt className="text-xs text-tertiary">Net sales</dt>
            {point.net_sales_inr === null ? (
              <dd className="text-sm font-medium text-primary">—</dd>
            ) : (
              <dd className="text-sm font-medium tabular-nums text-primary">
                {formatInr(point.net_sales_inr.toFixed(2))}
              </dd>
            )}
          </div>
        ) : null}
        {showCollections ? (
          <div>
            <dt className="text-xs text-tertiary">Collections</dt>
            {point.net_collected_inr === null ? (
              <dd className="text-sm font-medium text-primary">—</dd>
            ) : (
              <dd className="text-sm font-medium tabular-nums text-primary">
                {formatInr(point.net_collected_inr.toFixed(2))}
              </dd>
            )}
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function MonthToDateBars({
  salesInr,
  collectionsInr,
  periodPreset,
}: {
  salesInr: string;
  collectionsInr: string;
  periodPreset: PeriodPreset;
}): ReactNode {
  const sales = Number(salesInr);
  const collected = Number(collectionsInr);
  const due = periodDueFromSalesCollections(salesInr, collectionsInr);
  const hasDue = isPositiveMoney(due);
  const scale = Math.max(sales, collected, 1);
  const collectedWidthPct = (Math.min(collected, scale) / scale) * 100;
  const dueWidthPct = hasDue ? (Number(due) / scale) * 100 : 0;
  const salesSolidPct = sales > 0 ? (Math.min(collected, sales) / scale) * 100 : collectedWidthPct;
  const sectionLabel = periodPreset === "month" ? "Month to date" : "Period to date";

  if (isZeroMoney(salesInr) && isZeroMoney(collectionsInr)) {
    return null;
  }

  return (
    <div className="border-t border-secondary px-3 pb-3 pt-2">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[10px] font-semibold tracking-wider text-primary uppercase">
          {sectionLabel}
        </span>
        <span className="text-xs text-tertiary">
          the hatched end of the sales bar is what is still due
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-xs font-semibold text-primary">Sales</span>
          <div className="relative flex h-[18px] min-w-0">
            <span
              className="block h-full bg-primary-solid"
              style={{ width: `${String(salesSolidPct)}%` }}
            />
            {hasDue ? (
              <span
                className="block h-full border border-brand-solid"
                style={{
                  width: `${String(dueWidthPct)}%`,
                  background: `repeating-linear-gradient(45deg, ${CHART_ACCENT} 0 2px, #fff 2px 5px)`,
                }}
              />
            ) : null}
          </div>
          <span className="text-xs font-bold tabular-nums text-primary">{formatInr(salesInr)}</span>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-xs font-semibold text-primary">Collected</span>
          <div className="relative flex h-[18px] min-w-0">
            <span
              className="block h-full border border-brand-solid"
              style={{
                width: `${String(collectedWidthPct)}%`,
                background: `repeating-linear-gradient(45deg, ${CHART_HATCH_LIGHT} 0 2px, #fff 2px 4px)`,
              }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums" style={{ color: CHART_ACCENT_TEXT }}>
            {formatInr(collectionsInr)}
          </span>
        </div>
        {hasDue ? (
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2">
            <span />
            <div className="relative h-3">
              <div
                className="absolute top-0 border-t border-brand-solid"
                style={{
                  left: `${String(salesSolidPct)}%`,
                  width: `${String(dueWidthPct)}%`,
                }}
              >
                <span className="absolute top-0 left-0 h-1.5 border-l border-brand-solid" />
                <span className="absolute top-0 right-0 h-1.5 border-r border-brand-solid" />
              </div>
            </div>
            <span className="text-xs font-semibold tabular-nums" style={{ color: CHART_ACCENT_TEXT }}>
              {formatInr(due)} due
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PeriodSalesCollectionsChart({
  salesByDate,
  collectionsByDate,
  salesTotalInr,
  collectionsTotalInr,
  periodPreset,
  spanFrom,
  spanTo,
}: {
  salesByDate?: { business_date: string; net_sales_inr: string }[];
  collectionsByDate?: { business_date: string; net_collected_inr: string }[];
  salesTotalInr?: string;
  collectionsTotalInr?: string;
  periodPreset: PeriodPreset;
  spanFrom: string;
  spanTo: string;
}): ReactNode {
  const hatchId = `coll-hatch-${useId().replace(/:/g, "")}`;
  const CollectionsShape = useMemo(() => makeCollectionsBarShape(hatchId), [hatchId]);
  const showSales = salesByDate !== undefined;
  const showCollections = collectionsByDate !== undefined;
  const calendar = useMemo(
    () => buildCalendarSeries(salesByDate, collectionsByDate, spanFrom, spanTo),
    [collectionsByDate, salesByDate, spanFrom, spanTo],
  );
  const activityPoints = useMemo(
    () => mergeTrendPoints(salesByDate, collectionsByDate),
    [collectionsByDate, salesByDate],
  );
  const dataDays = datesWithDataCount(calendar);
  const hasAnyValue = dataDays > 0;
  const todayIndex = calendar.findIndex((point) => point.isToday);
  const [focusIndex, setFocusIndex] = useState<number | null>(
    todayIndex >= 0 ? todayIndex : null,
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    setFocusIndex(todayIndex >= 0 ? todayIndex : null);
  }, [todayIndex, spanFrom, spanTo]);

  const firstFuture = calendar.find((point) => point.isFuture);
  const lastDay = calendar[calendar.length - 1];
  const restLabel =
    periodPreset === "month" ? "rest of month" : periodPreset === "week" ? "rest of week" : "rest of period";

  const todayPoint = todayIndex >= 0 ? calendar[todayIndex] : null;
  const hoveredPoint =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < calendar.length
      ? calendar[hoverIndex]
      : null;
  const focusedPoint =
    focusIndex !== null && focusIndex >= 0 && focusIndex < calendar.length
      ? calendar[focusIndex]
      : null;
  // Keep today's callout unless another day is hovered.
  const calloutPoint =
    hoveredPoint && !hoveredPoint.isToday ? hoveredPoint : (todayPoint ?? focusedPoint);
  const guideDate =
    hoveredPoint?.business_date ?? focusedPoint?.business_date ?? todayPoint?.business_date ?? null;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (calendar.length === 0) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setFocusIndex((current) => {
          const base = current ?? (todayIndex >= 0 ? todayIndex : 0);
          const next =
            event.key === "ArrowLeft"
              ? Math.max(0, base - 1)
              : Math.min(calendar.length - 1, base + 1);
          return next;
        });
        setHoverIndex(null);
      }
    },
    [calendar.length, todayIndex],
  );

  const title =
    showSales && showCollections
      ? "Sales and collections by business date"
      : showSales
        ? "Sales by business date"
        : "Collections by business date";

  return (
    <div className="flex flex-col border-2 border-primary bg-primary">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-primary px-3 py-2">
        <h2 className="text-sm font-bold text-primary">{title}</h2>
        {hasAnyValue && dataDays >= 2 ? (
          <ul className="ml-auto flex flex-wrap items-center gap-3 text-xs text-tertiary">
            {showSales ? (
              <li className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 bg-primary-solid" aria-hidden />
                Net sales
              </li>
            ) : null}
            {showCollections ? (
              <li className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 border-2"
                  style={{
                    borderColor: CHART_ACCENT,
                    background: `repeating-linear-gradient(45deg, ${CHART_HATCH_LIGHT} 0 2px, #fff 2px 4px)`,
                  }}
                  aria-hidden
                />
                Collections
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {!hasAnyValue ? (
        <div className="p-3">
          <EmptyState size="sm">
            <EmptyState.Header pattern="none">
              <EmptyState.Content>
                <EmptyState.Title>
                  {showSales && showCollections
                    ? "No sales or collections in this range"
                    : showSales
                      ? "No sales in this range"
                      : "No collections in this range"}
                </EmptyState.Title>
                <EmptyState.Description>
                  {showCollections
                    ? "Posted sales payments appear here. Girvi is never included."
                    : "Finalized invoices and credit notes will appear here."}
                </EmptyState.Description>
              </EmptyState.Content>
            </EmptyState.Header>
          </EmptyState>
        </div>
      ) : dataDays < 2 ? (
        <CompactPeriodSummary
          points={activityPoints}
          showSales={showSales}
          showCollections={showCollections}
        />
      ) : (
        <div
          className="relative px-2 pt-2 outline-none"
          tabIndex={0}
          role="img"
          aria-label={`${title}. Use left and right arrow keys to move between days.`}
          onKeyDown={onKeyDown}
        >
          {calloutPoint ? (
            <div className="pointer-events-none absolute top-2 right-3 z-10">
              <DayCalloutBox point={calloutPoint} />
            </div>
          ) : null}
          <div className="h-56 w-full min-w-[min(100%,28rem)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={calendar}
                margin={{ top: 28, right: 8, left: 4, bottom: 4 }}
                barCategoryGap="18%"
                barGap={2}
                onMouseMove={(state) => {
                  if (typeof state.activeTooltipIndex === "number") {
                    setHoverIndex(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <pattern
                    id={hatchId}
                    width={4}
                    height={4}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width={4} height={4} fill="#fff" />
                    <rect width={2} height={4} fill={CHART_HATCH_LIGHT} />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                {firstFuture && lastDay ? (
                  <ReferenceArea
                    x1={firstFuture.business_date}
                    x2={lastDay.business_date}
                    fill="#F3F2F2"
                    fillOpacity={0.9}
                    strokeOpacity={0}
                    label={{
                      value: restLabel,
                      position: "insideTopLeft",
                      fill: "#8A8482",
                      fontSize: 10,
                    }}
                  />
                ) : null}
                {guideDate ? (
                  <ReferenceLine
                    x={guideDate}
                    stroke={CHART_INK}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                  />
                ) : null}
                <XAxis
                  dataKey="business_date"
                  tickFormatter={(value: string) => {
                    const point = calendar.find((row) => row.business_date === value);
                    if (!point) {
                      return "";
                    }
                    const dayNum = Number(point.dayLabel);
                    if (point.isToday || dayNum % 2 === 1) {
                      return point.dayLabel;
                    }
                    return "";
                  }}
                  tick={(props) => {
                    const { x, y, payload } = props as {
                      x: number;
                      y: number;
                      payload: { value: string };
                    };
                    const point = calendar.find((row) => row.business_date === payload.value);
                    if (!point) {
                      return <g />;
                    }
                    const dayNum = Number(point.dayLabel);
                    if (!point.isToday && dayNum % 2 !== 1) {
                      return <g />;
                    }
                    return (
                      <text
                        x={x}
                        y={y + 10}
                        textAnchor="middle"
                        fill={point.isToday ? CHART_INK : "#676767"}
                        fontSize={11}
                        fontWeight={point.isToday ? 700 : 400}
                      >
                        {point.dayLabel}
                      </text>
                    );
                  }}
                  axisLine={{ stroke: CHART_INK, strokeWidth: 1.5 }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tickFormatter={(value: number) => `₹${formatInrCompact(value)}`}
                  tick={{ fill: "#676767", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={() => null} cursor={{ fill: "rgba(17,17,17,0.04)" }} />
                {showSales ? (
                  <Bar
                    dataKey="net_sales_inr"
                    name="Net sales (₹)"
                    isAnimationActive={false}
                    shape={SalesBarShape}
                  />
                ) : null}
                {showCollections ? (
                  <Bar
                    dataKey="net_collected_inr"
                    name="Collections (₹)"
                    isAnimationActive={false}
                    shape={CollectionsShape}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="px-1 pb-2 text-xs text-tertiary">
            Days without sales are gaps, not zeros. Future days are shaded. Hover a day for exact
            figures.
          </p>
        </div>
      )}

      {salesTotalInr !== undefined && collectionsTotalInr !== undefined ? (
        <MonthToDateBars
          salesInr={salesTotalInr}
          collectionsInr={collectionsTotalInr}
          periodPreset={periodPreset}
        />
      ) : null}
    </div>
  );
}
