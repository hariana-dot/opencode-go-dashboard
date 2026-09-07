import { Loader, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEstimate, getPriceSnapshot, syncUsageHistory } from "../lib/api";
import { paletteColor } from "../lib/colors";
import { usageBarColor, usageTextColor } from "../lib/format";
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

function fmtDM(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function fmtDMY(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function modelSuffix(id: string): string {
  const raw = id.toLowerCase();
  const slash = raw.indexOf("/");
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

export default function EstimateBlock({ accountId, refreshToken }: Props) {
  const { refModel, setRefModel, t } = usePrefs();
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
      first = await fetchEstimate(accountId, refModel || undefined);
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
      setEstimate(await fetchEstimate(accountId, refModel || undefined));
    } catch {
      // keep the first estimate rather than failing the whole block
    }
    setSyncing(false);
  }, [accountId, refModel, t]);

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
  const poolUsd = estimate?.poolUsd ?? null;
  const officialBar =
    officialPct != null ? Math.min(100, Math.max(0, officialPct)) : 0;

  const refOptions = useMemo(() => {
    if (!snapshot) return [];
    const seen = new Set<string>();
    for (const model of snapshot.models) {
      const suffix = modelSuffix(String(model.id ?? ""));
      if (!suffix || suffix === "big-pickle") continue;
      seen.add(suffix);
    }
    return [...seen].sort();
  }, [snapshot]);

  function futureUsd(row: EstimateSpendRow): number {
    return row.rate7UsdPerDay * daysRemaining;
  }

  function projectedPct(row: EstimateSpendRow): number | null {
    if (officialPct == null || !poolUsd || !(poolUsd > 0)) return null;
    return officialPct + (futureUsd(row) * 100) / poolUsd;
  }

  function rightLabel(row: EstimateSpendRow): ReactNode {
    if (row.rate7UsdPerDay <= 0) {
      return <span className="text-kumo-subtle">—</span>;
    }
    const projected = projectedPct(row);
    if (projected == null || officialPct == null || !poolUsd) {
      return <span className="text-kumo-subtle">—</span>;
    }
    if (projected > 100) {
      const remainingUsd = ((100 - officialPct) / 100) * poolUsd;
      const daysToCap = remainingUsd / row.rate7UsdPerDay;
      const capDate = fmtDM(new Date(nowMs + daysToCap * DAY_MS));
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
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Text variant="secondary" as="span" DANGEROUS_className="text-sm">
          {t("estRefLabel")}
        </Text>
        <select
          className="rounded-md border border-kumo-line bg-transparent px-2 py-1 text-sm text-kumo-default"
          value={refModel}
          onChange={(event) => setRefModel(event.target.value)}
        >
          <option value="">{t("estRefAuto")}</option>
          {refOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>
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
              date: fmtDMY(new Date(snapshot.fetchedAt)),
              credit: snapshot.monthlyCost,
            })}
          </Text>
        </>
      )}
    </div>
  );
}
