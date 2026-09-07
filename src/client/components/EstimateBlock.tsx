import { Loader, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { fetchEstimate, getPriceSnapshot, syncUsageHistory } from "../lib/api";
import { paletteColor } from "../lib/colors";
import { usageBarColor, usageTextColor } from "../lib/format";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import type {
  EstimateResult,
  EstimateSpendRow,
  PriceSnapshotData,
  UsageSyncResult,
} from "../types";

const DAY_MS = 86_400_000;
const SYNC_ROUNDS = 25;

interface Props {
  accountId: string;
  refreshToken: number;
}

function paceColor(pct: number): string {
  if (pct > 130) return "text-kumo-danger";
  if (pct >= 100) return "text-kumo-warning";
  return "text-kumo-success";
}

function fmtUsd(n: number): string {
  return `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;
}

function rowLabel(row: EstimateSpendRow): string {
  return row.model;
}

export default function EstimateBlock({ accountId, refreshToken }: Props) {
  const { locale, t } = usePrefs();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [snapshot, setSnapshot] = useState<PriceSnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let first: EstimateResult;
    try {
      first = await fetchEstimate(accountId);
      setEstimate(first);
      setSnapshot(await getPriceSnapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("queryFailed"));
      setLoading(false);
      return;
    }
    setLoading(false);
    setSyncing(true);
    const until = new Date(Date.now() - 8 * DAY_MS).toISOString();
    for (let i = 0; i < SYNC_ROUNDS; i++) {
      let result: UsageSyncResult;
      try {
        result = await syncUsageHistory(accountId, until);
      } catch {
        break;
      }
      if (result.error || result.done) break;
    }
    try {
      setEstimate(await fetchEstimate(accountId));
    } catch {
      // keep the first estimate rather than failing the whole block
    }
    setSyncing(false);
  }, [accountId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const nowMs = Date.now();
  const windowStartMs = estimate ? Date.parse(estimate.windowStart) : NaN;
  const daysRemaining =
    estimate && !Number.isNaN(windowStartMs)
      ? Math.max(0, (windowStartMs + estimate.windowLengthMs - nowMs) / DAY_MS)
      : 0;

  const officialPct = estimate?.officialMonthlyPct ?? null;
  const officialBar =
    officialPct != null ? Math.min(100, Math.max(0, officialPct)) : 0;

  function futureUsd(row: EstimateSpendRow): number {
    return row.rate7UsdPerDay * daysRemaining;
  }

  function projectedPct(row: EstimateSpendRow): number | null {
    if (officialPct == null || !(row.usage > 0)) return null;
    return officialPct + (futureUsd(row) * 100) / row.usage;
  }

  function rightLabel(row: EstimateSpendRow): ReactNode {
    if (row.rate7UsdPerDay <= 0) {
      return <span className="text-kumo-subtle">—</span>;
    }
    const projected = projectedPct(row);
    if (projected == null || officialPct == null) {
      return <span className="text-kumo-subtle">—</span>;
    }
    if (projected > 100) {
      const pool = ((100 - officialPct) / 100) * row.usage;
      const daysToCap = pool / row.rate7UsdPerDay;
      const capDate = new Date(nowMs + daysToCap * DAY_MS).toLocaleDateString(
        localeTag(locale),
        { month: "short", day: "numeric" }
      );
      const early = Math.max(0, Math.round(daysRemaining - daysToCap));
      return (
        <span className={paceColor(projected)}>
          {t("estCapShort", { date: capDate, early })}
        </span>
      );
    }
    return (
      <span className={paceColor(projected)}>
        {t("estByReset", { n: fmtUsd(futureUsd(row)) })}
      </span>
    );
  }

  function BarRow(props: {
    row: EstimateSpendRow;
    fillColor: string;
  }) {
    const projected = projectedPct(props.row);
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate font-mono text-kumo-default">
            {rowLabel(props.row)}
            <span className="ml-1 font-sans text-kumo-subtle">
              {t("estMaxUsd", { n: fmtUsd(props.row.usage) })}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{rightLabel(props.row)}</span>
        </div>
        <div className="relative mt-1 h-2.5">
          <div className="absolute inset-0 overflow-hidden rounded-full bg-kumo-recessed">
            {officialPct != null ? (
              <div
                className={`h-full rounded-full ${usageBarColor(officialBar)}`}
                style={{ width: `${Math.max(officialBar, 2)}%` }}
              />
            ) : null}
          </div>
          {projected != null && props.row.rate7UsdPerDay > 0 ? (
            <span
              className={`absolute bottom-[-3px] top-[-3px] ${paceColor(projected)}`}
              style={{
                left: `${Math.min(100, Math.max(0, projected))}%`,
                borderLeft: "2px dashed currentColor",
                transform: "translateX(-50%)",
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-kumo-line pt-4">
      <Text variant="heading3" as="h3" DANGEROUS_className="m-0">
        {t("estTitle")}
      </Text>
      <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-1 text-sm">
        {t("estHint")}
      </Text>

      {loading && !estimate ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-kumo-subtle">
          <Loader />
          {syncing ? t("syncing") : t("loading")}
        </div>
      ) : error && !estimate ? (
        <Text
          variant="secondary"
          as="p"
          DANGEROUS_className="m-0 mt-3 text-sm text-kumo-danger"
        >
          {error}
        </Text>
      ) : !estimate || !snapshot ? (
        <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-3 text-sm">
          {t("estNoPrices")}
        </Text>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-x-3 text-[11px] text-kumo-subtle">
            <span>{t("estRecords", { n: estimate.recordCount })}</span>
            <span>{t("estLegend")}</span>
          </div>

          {estimate.rows.length > 0 || estimate.ref ? (
            <div className="mt-3">
              {estimate.ref ? (
                <div className="mb-1">
                  <BarRow row={estimate.ref} fillColor={paletteColor(0)} />
                </div>
              ) : null}
              {estimate.rows.map((row, index) => (
                <BarRow
                  key={row.model}
                  row={row}
                  fillColor={paletteColor(index + 1)}
                />
              ))}
            </div>
          ) : (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 mt-3 text-sm"
            >
              {t("estNoData")}
            </Text>
          )}

          {syncing ? (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-kumo-subtle">
              <Loader />
              {t("syncing")}
            </div>
          ) : null}

          <Text
            variant="secondary"
            as="p"
            DANGEROUS_className="m-0 mt-2 text-[11px]"
          >
            {t("estPriceFrom", {
              date: new Date(snapshot.fetchedAt).toLocaleDateString(
                localeTag(locale)
              ),
              credit: snapshot.monthlyCost,
            })}
          </Text>
        </>
      )}
    </div>
  );
}
