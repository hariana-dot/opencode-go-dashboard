import { Loader, Text } from "@cloudflare/kumo";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchUsageOverview, syncUsageHistory } from "../lib/api";
import { paletteColor, PALETTE } from "../lib/colors";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import { COST_SCALE, type UsageOverviewResult } from "../types";

interface Props {
  accountId: string;
  refreshToken: number;
}

function monthLabel(
  year: number,
  month: number,
  locale: string,
  monthStyle: "short" | "long" = "short"
): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(locale, {
    month: monthStyle,
    year: "numeric",
    timeZone: "UTC",
  });
}

function padMonth(n: number): string {
  return String(n).padStart(2, "0");
}

function formatAxisUsd(n: number): string {
  if (n >= 10) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

export default function CostChart({ accountId, refreshToken }: Props) {
  const { locale, t } = usePrefs();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [modelFilter, setModelFilter] = useState("all");
  const [data, setData] = useState<UsageOverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const autoSynced = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const overview = await fetchUsageOverview(accountId, year, month);
      setData(overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("queryFailed"));
    } finally {
      setLoading(false);
    }
  }, [accountId, year, month, t]);

  const syncAll = useCallback(async () => {
    setSyncing(true);
    setError("");
    const until = `${year}-${padMonth(month)}-01T00:00:00.000Z`;
    try {
      for (let i = 0; i < 25; i++) {
        const result = await syncUsageHistory(accountId, until);
        if (result.error) {
          setError(result.error);
          break;
        }
        if (result.done) break;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("syncFailed"));
    } finally {
      setSyncing(false);
    }
  }, [accountId, year, month, load, t]);

  const syncAllRef = useRef(syncAll);
  syncAllRef.current = syncAll;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshToken === 0) return;
    void syncAllRef.current();
  }, [refreshToken]);

  useEffect(() => {
    if (loading || syncing || !data || autoSynced.current) return;
    if (data.series.length === 0 && !data.lastSyncedAt) {
      autoSynced.current = true;
      void syncAll();
    }
  }, [loading, syncing, data, syncAll]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
    setModelFilter("all");
  }

  const models = useMemo(() => {
    if (!data) return [];
    if (modelFilter === "all") return data.models;
    return data.models.filter((m) => m === modelFilter);
  }, [data, modelFilter]);

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    (data?.models ?? []).forEach((m, i) => map.set(m, PALETTE[i % PALETTE.length]));
    return map;
  }, [data]);

  const days = data?.daysInMonth ?? 30;
  const byDay = useMemo(() => {
    const grid: number[][] = Array.from({ length: days }, () =>
      models.map(() => 0)
    );
    if (!data) return grid;
    const index = new Map(models.map((m, i) => [m, i]));
    for (const row of data.series) {
      const mi = index.get(row.model);
      if (mi === undefined) continue;
      const day = Number(row.date.slice(8, 10));
      if (day >= 1 && day <= days) {
        grid[day - 1][mi] += row.cost / COST_SCALE;
      }
    }
    return grid;
  }, [data, days, models]);

  const maxY = useMemo(() => {
    let max = 0;
    for (const day of byDay) {
      const sum = day.reduce((a, b) => a + b, 0);
      if (sum > max) max = sum;
    }
    return max > 0 ? max * 1.15 : 1;
  }, [byDay]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => maxY * p);
  const w = 640;
  const h = 220;
  const padL = 40;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const gap = Math.max(1, innerW / days * 0.28);
  const barW = innerW / days - gap;

  const xLabels = [1, 9, 17, 25].filter((d) => d <= days);

  return (
    <div className="mt-5 border-t border-kumo-line pt-4">
      <Text variant="heading3" as="h3" DANGEROUS_className="m-0">
        {t("costTitle")}
      </Text>
      <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-1 text-sm">
        {t("costHint")}
      </Text>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-md border border-kumo-line">
          <button
            type="button"
            className="shrink-0 px-1.5 py-1.5 text-kumo-default"
            onClick={() => shiftMonth(-1)}
            aria-label={t("prevPage")}
          >
            <CaretLeft size={14} />
          </button>
          <span className="min-w-0 flex-1 truncate px-1 text-center text-xs tabular-nums">
            {monthLabel(year, month, localeTag(locale), "short")}
          </span>
          <button
            type="button"
            className="shrink-0 px-1.5 py-1.5 text-kumo-default"
            onClick={() => shiftMonth(1)}
            aria-label={t("nextPage")}
          >
            <CaretRight size={14} />
          </button>
        </div>
        <select
          className="w-[42%] max-w-[11rem] shrink-0 rounded-md border border-kumo-line bg-kumo-elevated px-1.5 py-1.5 text-xs"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
        >
          <option value="all">{t("allModels")}</option>
          {(data?.models ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!data && (loading || syncing) ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-kumo-subtle">
          <Loader />
          {syncing ? t("syncing") : t("loading")}
        </div>
      ) : error && !data ? (
        <Text
          variant="secondary"
          as="p"
          DANGEROUS_className="m-0 mt-4 text-sm text-kumo-danger"
        >
          {error}
        </Text>
      ) : (
        <div className="mt-3 overflow-x-auto">
          {syncing ? (
            <div className="mb-2 flex items-center gap-2 text-xs text-kumo-subtle">
              <Loader />
              {t("syncing")}
            </div>
          ) : null}
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-52 w-full min-w-[20rem] text-kumo-subtle"
            role="img"
            aria-label={t("costTitle")}
          >
            {ticks.map((tick, i) => {
              const y = padT + innerH - (tick / maxY) * innerH;
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={w - padR}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity="0.25"
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="currentColor"
                  >
                    {formatAxisUsd(tick)}
                  </text>
                </g>
              );
            })}
            {byDay.map((stack, di) => {
              const x = padL + di * (barW + gap) + gap / 2;
              let y = padT + innerH;
              return (
                <g key={di}>
                  {stack.map((value, mi) => {
                    if (value <= 0) return null;
                    const bh = (value / maxY) * innerH;
                    y -= bh;
                    return (
                      <rect
                        key={mi}
                        x={x}
                        y={y}
                        width={Math.max(barW, 1)}
                        height={bh}
                        fill={colorOf.get(models[mi]) ?? PALETTE[0]}
                      />
                    );
                  })}
                </g>
              );
            })}
            {xLabels.map((d) => {
              const x = padL + (d - 1) * (barW + gap) + gap / 2 + barW / 2;
              return (
                <text
                  key={d}
                  x={x}
                  y={h - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {monthLabel(year, month, "en-US").slice(0, 3)} {String(d).padStart(2, "0")}
                </text>
              );
            })}
          </svg>
          {models.length === 0 ? (
            <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-2 text-sm">
              {t("noChartData")}
            </Text>
          ) : (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {models.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: colorOf.get(m) }}
                  />
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
