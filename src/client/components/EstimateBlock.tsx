import { Loader, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEstimate, getPriceSnapshot } from "../lib/api";
import { paletteColor } from "../lib/colors";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import type {
  EstimateModelDailyPoint,
  EstimateResult,
  PriceModel,
  PriceSnapshotData,
} from "../types";

const DAY_MS = 86_400_000;
const GLM_FLASH_RE = /^glm-\d+(?:\.\d+)*-flash$/;

interface Props {
  accountId: string;
  refreshToken: number;
}

interface BarRowSpec {
  key: string;
  label: string;
  isRef: boolean;
  fillPct: number;
  rateFracPerDay: number;
  projectedPct: number;
}

function suffixOf(id: string): string {
  const i = id.lastIndexOf("/");
  return (i >= 0 ? id.slice(i + 1) : id).toLowerCase();
}

function paceColor(pct: number): string {
  if (pct > 130) return "text-kumo-danger";
  if (pct >= 100) return "text-kumo-warning";
  return "text-kumo-success";
}

function fmt1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function glmVersionParts(suffix: string): number[] {
  return (suffix.match(/\d+/g) ?? []).map(Number);
}

function dailyCostAvg(
  daily: EstimateModelDailyPoint[],
  lookbackDays: number
): number {
  if (!daily || daily.length === 0) return 0;
  const byDate = new Map(daily.map((point) => [point.date, point.costUsd]));
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  let sum = 0;
  for (let i = 1; i <= lookbackDays; i++) {
    const day = new Date(todayUtc.getTime() - i * DAY_MS)
      .toISOString()
      .slice(0, 10);
    sum += byDate.get(day) ?? 0;
  }
  return sum / lookbackDays;
}

function BarRow(props: {
  label: string;
  mutedLabel?: boolean;
  fillPct: number;
  fillColor: string;
  solidPct: number | null;
  dottedPct: number | null;
  dottedClassName: string;
  right: ReactNode;
}) {
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`min-w-0 truncate ${props.mutedLabel ? "italic text-kumo-subtle" : "text-kumo-default"}`}
        >
          {props.label}
        </span>
        <span className="shrink-0 tabular-nums">{props.right}</span>
      </div>
      <div className="relative mt-1 h-2.5">
        <div className="absolute inset-0 overflow-hidden rounded-full bg-kumo-recessed">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(props.fillPct, props.fillPct > 0 ? 2 : 0))}%`,
              background: props.fillColor,
            }}
          />
        </div>
        {props.solidPct != null ? (
          <span
            className="absolute bottom-[-3px] top-[-3px] w-[2px] text-kumo-default"
            style={{
              left: `${Math.min(100, Math.max(0, props.solidPct))}%`,
              background: "currentColor",
              transform: "translateX(-50%)",
            }}
          />
        ) : null}
        {props.dottedPct != null ? (
          <span
            className={`absolute bottom-[-3px] top-[-3px] ${props.dottedClassName}`}
            style={{
              left: `${Math.min(100, Math.max(0, props.dottedPct))}%`,
              borderLeft: "2px dashed currentColor",
              transform: "translateX(-50%)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function EstimateBlock({ accountId, refreshToken }: Props) {
  const { locale, t } = usePrefs();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [snapshot, setSnapshot] = useState<PriceSnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [est, price] = await Promise.all([
        fetchEstimate(accountId),
        getPriceSnapshot(),
      ]);
      setEstimate(est);
      setSnapshot(price);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("queryFailed"));
    } finally {
      setLoading(false);
    }
  }, [accountId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const nowMs = Date.now();
  const windowStartMs = estimate ? Date.parse(estimate.windowStart) : NaN;
  const windowDays = estimate ? estimate.windowLengthMs / DAY_MS : 30;
  const elapsedDays =
    estimate && !Number.isNaN(windowStartMs)
      ? (nowMs - windowStartMs) / DAY_MS
      : 0;
  const pacePct =
    estimate?.estUsedPct != null && elapsedDays >= 0.5
      ? (estimate.estUsedPct * windowDays) / Math.max(elapsedDays, 0.01)
      : null;
  const daysRemaining =
    estimate && !Number.isNaN(windowStartMs)
      ? Math.max(0, (windowStartMs + estimate.windowLengthMs - nowMs) / DAY_MS)
      : 0;

  const usedPct = estimate?.estUsedPct ?? null;
  const barPct = usedPct != null ? Math.min(100, Math.max(0, usedPct)) : 0;
  const delta =
    usedPct != null && estimate?.officialMonthlyPct != null
      ? Math.round((usedPct - estimate.officialMonthlyPct) * 10) / 10
      : null;

  const overallRate = useMemo(() => {
    if (!estimate) return 0;
    const byDate = new Map(
      estimate.dailyBurn.map((point) => [point.date, point.fraction])
    );
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    let sum = 0;
    for (let i = 1; i <= 7; i++) {
      const day = new Date(todayUtc.getTime() - i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      sum += byDate.get(day) ?? 0;
    }
    return sum / 7;
  }, [estimate]);

  const overallProjected =
    usedPct != null && overallRate > 0
      ? usedPct + overallRate * 100 * daysRemaining
      : null;

  const refModel = useMemo<PriceModel | null>(() => {
    if (!snapshot) return null;
    const candidates = snapshot.models.filter((m) =>
      GLM_FLASH_RE.test(suffixOf(m.id))
    );
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const pa = glmVersionParts(suffixOf(a.id));
      const pb = glmVersionParts(suffixOf(b.id));
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    })[0];
  }, [snapshot]);

  const rows = useMemo<BarRowSpec[]>(() => {
    if (!estimate || usedPct == null) return [];
    const refSuffix = refModel ? suffixOf(refModel.id) : "";
    const total7dCost = estimate.models.reduce(
      (sum, m) => sum + dailyCostAvg(m.daily ?? [], 7),
      0
    );

    const used: BarRowSpec[] = [];
    let refBurned = 0;
    for (const m of estimate.models) {
      if (m.usage == null || m.usage <= 0) continue;
      if (refSuffix && m.model === refSuffix) {
        refBurned = m.burnedFraction;
        continue;
      }
      const rate = dailyCostAvg(m.daily ?? [], 7) / m.usage;
      used.push({
        key: m.model,
        label: m.model,
        isRef: false,
        fillPct: m.burnedFraction * 100,
        rateFracPerDay: rate,
        projectedPct: usedPct + rate * 100 * daysRemaining,
      });
    }
    used.sort((a, b) => b.projectedPct - a.projectedPct);

    if (refModel) {
      const rate = total7dCost / refModel.usage;
      used.unshift({
        key: refSuffix,
        label: t("estGlmFlashRef"),
        isRef: true,
        fillPct: refBurned * 100,
        rateFracPerDay: rate,
        projectedPct: usedPct + rate * 100 * daysRemaining,
      });
    }
    return used;
  }, [estimate, usedPct, refModel, daysRemaining, t]);

  function rightLabel(
    rateFracPerDay: number,
    projectedPct: number
  ): ReactNode {
    if (rateFracPerDay <= 0) {
      return <span className="text-kumo-subtle">—</span>;
    }
    if (projectedPct > 100) {
      const used = estimate?.estUsedPct ?? 0;
      const daysToCap = (100 - used) / (rateFracPerDay * 100);
      const capDate = new Date(nowMs + daysToCap * DAY_MS).toLocaleDateString(
        localeTag(locale),
        { month: "short", day: "numeric" }
      );
      const early = Math.max(0, Math.round(daysRemaining - daysToCap));
      return (
        <span className={paceColor(projectedPct)}>
          {t("estCapShort", { date: capDate, early })}
        </span>
      );
    }
    return (
      <span className={paceColor(projectedPct)}>{fmt1(projectedPct)}%</span>
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
          {t("loading")}
        </div>
      ) : error && !estimate ? (
        <Text
          variant="secondary"
          as="p"
          DANGEROUS_className="m-0 mt-3 text-sm text-kumo-danger"
        >
          {error}
        </Text>
      ) : !estimate || usedPct == null || !snapshot ? (
        <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-3 text-sm">
          {t("estNoPrices")}
        </Text>
      ) : (
        <>
          <BarRow
            label={`${t("estUsed")} ${usedPct}%`}
            fillPct={barPct}
            fillColor={
              barPct >= 75
                ? "#e5484d"
                : barPct >= 50
                  ? "#f5a524"
                  : "#30a46c"
            }
            solidPct={null}
            dottedPct={overallRate > 0 ? overallProjected : null}
            dottedClassName={paceColor(overallProjected ?? 0)}
            right={
              overallRate > 0 && overallProjected != null
                ? rightLabel(overallRate, overallProjected)
                : (
                    <span className="text-kumo-subtle">—</span>
                  )
            }
          />

          <div className="mt-1 flex gap-2 text-[11px] text-kumo-subtle">
            <span>
              {t("estOfficial")}:{" "}
              {estimate.officialMonthlyPct != null
                ? `${estimate.officialMonthlyPct}%`
                : "—"}
            </span>
            {delta != null ? (
              <span
                className={
                  Math.abs(delta) <= 2
                    ? "text-kumo-success"
                    : "text-kumo-warning"
                }
              >
                Δ {delta > 0 ? "+" : ""}
                {delta}
              </span>
            ) : null}
            <span className={paceColor(overallProjected ?? 0)}>
              {t("estLegend")}
            </span>
          </div>

          {pacePct != null ? (
            <p className={`m-0 mt-2 text-[11px] ${paceColor(pacePct)}`}>
              {t("estPace", {
                pace: fmt1(pacePct),
                day: Math.max(1, Math.ceil(elapsedDays)),
                total: Math.round(windowDays),
              })}
            </p>
          ) : estimate ? (
            <p className="m-0 mt-2 text-[11px] text-kumo-subtle">
              {t("estResetAgo", {
                hours: Math.max(0, Math.floor(elapsedDays * 24)),
              })}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="mt-3">
              {rows.map((row, index) => (
                <div key={row.key}>
                  <BarRow
                    label={row.label}
                    mutedLabel={row.isRef}
                    fillPct={row.fillPct}
                    fillColor={paletteColor(index)}
                    solidPct={usedPct}
                    dottedPct={
                      row.rateFracPerDay > 0
                        ? Math.max(row.projectedPct, usedPct + 0.5)
                        : null
                    }
                    dottedClassName={paceColor(row.projectedPct)}
                    right={rightLabel(row.rateFracPerDay, row.projectedPct)}
                  />
                  {row.isRef && row.fillPct === 0 ? (
                    <p className="m-0 mt-0.5 text-[10px] text-kumo-subtle">
                      {t("estRefScenario")}
                    </p>
                  ) : null}
                </div>
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

          {estimate.approxRequests > 0 ? (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 mt-2 text-[11px]"
            >
              {t("estApprox", { n: estimate.approxRequests })}
            </Text>
          ) : null}
          {estimate.unmappedRequests > 0 ? (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 mt-1 text-[11px]"
            >
              {t("estUnmapped", {
                n: estimate.unmappedRequests,
                models: estimate.unmappedModels
                  .map((m) => m.model)
                  .join(", "),
              })}
            </Text>
          ) : null}

          <Text
            variant="secondary"
            as="p"
            DANGEROUS_className="m-0 mt-2 text-[11px]"
          >
            {t("estPriceFrom", {
              date: new Date(
                estimate.priceFetchedAt ?? snapshot.fetchedAt
              ).toLocaleDateString(localeTag(locale)),
              credit: snapshot.monthlyCost,
            })}
          </Text>
        </>
      )}
    </div>
  );
}
