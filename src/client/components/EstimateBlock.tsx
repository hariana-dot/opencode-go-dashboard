import { Loader, Text } from "@cloudflare/kumo";
import { useCallback, useEffect, useState } from "react";
import { fetchEstimate, getPriceSnapshot, syncUsageHistory } from "../lib/api";
import { paletteColor } from "../lib/colors";
import { formatDuration, usageBarColor, usageTextColor } from "../lib/format";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import type {
  EstimateHypoModel,
  EstimateResult,
  PriceSnapshotData,
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

function fmt1(n: number): string {
  return String(Math.round(n * 10) / 10);
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
    try {
      let est = await fetchEstimate(accountId);
      if (est.recordCount === 0) {
        setSyncing(true);
        for (let i = 0; i < SYNC_ROUNDS; i++) {
          const result = await syncUsageHistory(accountId, est.windowStart);
          if (result.error) {
            setError(result.error);
            break;
          }
          if (result.done) break;
        }
        est = await fetchEstimate(accountId);
        setSyncing(false);
      }
      setEstimate(est);
      setSnapshot(await getPriceSnapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("queryFailed"));
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [accountId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const nowMs = Date.now();
  const windowStartMs = estimate ? Date.parse(estimate.windowStart) : NaN;
  const windowDays = estimate ? estimate.windowLengthMs / DAY_MS : 30;
  const daysRemaining =
    estimate && !Number.isNaN(windowStartMs)
      ? Math.max(0, (windowStartMs + estimate.windowLengthMs - nowMs) / DAY_MS)
      : 0;

  function rightLabel(hypo: EstimateHypoModel): React.ReactNode {
    const projected =
      hypo.hypUsedPct + hypo.rateFracPerDay * 100 * daysRemaining;
    if (hypo.rateFracPerDay <= 0) {
      return <span className="text-kumo-subtle">{fmt1(hypo.hypUsedPct)}%</span>;
    }
    if (projected > 100) {
      const daysToCap = (100 - hypo.hypUsedPct) / (hypo.rateFracPerDay * 100);
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
    return <span className={paceColor(projected)}>{fmt1(projected)}%</span>;
  }

  const officialPct = estimate?.officialMonthlyPct ?? null;
  const officialBar =
    officialPct != null ? Math.min(100, Math.max(0, officialPct)) : 0;

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
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <Text variant="secondary" as="span">
                {t("estOfficial")}
              </Text>
              <span className="flex items-center gap-2">
                {officialPct != null ? (
                  <span
                    className={`font-medium tabular-nums ${usageTextColor(officialBar)}`}
                  >
                    {officialPct}%
                  </span>
                ) : (
                  <span className="text-kumo-subtle">—</span>
                )}
                {estimate.officialResetInSec != null ? (
                  <span className="text-kumo-subtle">
                    {t("resetIn", {
                      duration: formatDuration(
                        estimate.officialResetInSec,
                        locale
                      ),
                    })}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-kumo-recessed">
              {officialPct != null ? (
                <div
                  className={`h-full rounded-full transition-all ${usageBarColor(officialBar)}`}
                  style={{ width: `${Math.max(officialBar, 2)}%` }}
                />
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-kumo-subtle">
              <span>{t("estRecords", { n: estimate.recordCount })}</span>
              <span>{t("estLegend")}</span>
            </div>
          </div>

          {estimate.models.length > 0 || estimate.ref ? (
            <div className="mt-3">
              {estimate.ref ? (
                <div className="mb-1">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate font-medium text-kumo-default">
                      {estimate.ref.model}
                    </span>
                    {rightLabel(estimate.ref)}
                  </div>
                  <div className="relative mt-1 h-2.5">
                    <div className="absolute inset-0 overflow-hidden rounded-full bg-kumo-recessed">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(estimate.ref.hypUsedPct, estimate.ref.hypUsedPct > 0 ? 2 : 0))}%`,
                          background: paletteColor(0),
                        }}
                      />
                    </div>
                    <span
                      className={`absolute bottom-[-3px] top-[-3px] ${paceColor(
                        estimate.ref.hypUsedPct +
                          estimate.ref.rateFracPerDay * 100 * daysRemaining
                      )}`}
                      style={{
                        left: `${Math.min(
                          100,
                          Math.max(
                            0,
                            estimate.ref.hypUsedPct +
                              estimate.ref.rateFracPerDay * 100 * daysRemaining
                          )
                        )}%`,
                        borderLeft: "2px dashed currentColor",
                        transform: "translateX(-50%)",
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {estimate.models.map((model, index) => {
                const projected =
                  model.hypUsedPct + model.rateFracPerDay * 100 * daysRemaining;
                return (
                  <div key={model.model} className="mt-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate font-mono text-kumo-default">
                        {model.model}
                      </span>
                      {rightLabel(model)}
                    </div>
                    <div className="relative mt-1 h-2.5">
                      <div className="absolute inset-0 overflow-hidden rounded-full bg-kumo-recessed">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(model.hypUsedPct, model.hypUsedPct > 0 ? 2 : 0))}%`,
                            background: paletteColor(index + 1),
                          }}
                        />
                      </div>
                      <span
                        className={`absolute bottom-[-3px] top-[-3px] ${paceColor(projected)}`}
                        style={{
                          left: `${Math.min(100, Math.max(0, projected))}%`,
                          borderLeft: "2px dashed currentColor",
                          transform: "translateX(-50%)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
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
