import { Loader, Text } from "@cloudflare/kumo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEstimate, getPriceSnapshot } from "../lib/api";
import { localeTag } from "../lib/i18n";
import { usageBarColor, usageTextColor } from "../lib/format";
import { usePrefs } from "../lib/prefs";
import type {
  EstimateResult,
  PriceModel,
  PriceSnapshotData,
} from "../types";

interface Props {
  accountId: string;
  refreshToken: number;
}

function suffixOf(id: string): string {
  const i = id.lastIndexOf("/");
  return (i >= 0 ? id.slice(i + 1) : id).toLowerCase();
}

function costPerReq(model: PriceModel): number {
  const pattern = model.pattern;
  if (!pattern) return 0;
  const cw = model.cachedWrite ?? model.input ?? 0;
  const input = model.input ?? 0;
  const read = model.cachedRead ?? 0;
  const output = model.output ?? 0;
  return (
    ((0.05 * input + 0.95 * cw) * pattern.input +
      read * pattern.cachedRead +
      output * pattern.output) /
    1e6
  );
}

function patternTokens(model: PriceModel): number {
  const p = model.pattern;
  if (!p) return 0;
  return p.input + p.cachedRead + p.output;
}

function isPeakNow(snapshot: PriceSnapshotData, suffix: string): boolean {
  const key = suffix.replace(/[^a-z0-9]/g, "");
  const ranges = snapshot.peakHours?.[key];
  if (!ranges) return false;
  const hour = new Date().getUTCHours();
  return ranges.some(([from, to]) => hour >= from && hour < to);
}

function fmtReq(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return Math.round(n).toLocaleString("en-US");
}

function fmtTok(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export default function EstimateBlock({ accountId, refreshToken }: Props) {
  const { locale, t } = usePrefs();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [snapshot, setSnapshot] = useState<PriceSnapshotData | null>(null);
  const [selected, setSelected] = useState("");
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
      if (!selected && est.models.length > 0) {
        setSelected(est.models[0].model);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("queryFailed"));
    } finally {
      setLoading(false);
    }
  }, [accountId, selected, t]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const selectedRow = useMemo(
    () => estimate?.models.find((m) => m.model === selected) ?? null,
    [estimate, selected]
  );

  const projection = useMemo(() => {
    if (!snapshot || !selected) return null;
    const rows = snapshot.models.filter((m) => suffixOf(m.id) === selected);
    if (rows.length === 0) return null;
    const usage = rows[0].usage;
    const remainingFrac = (estimate?.estRemainingPct ?? 0) / 100;
    const remainingUsd = remainingFrac * usage;
    const peakRow = rows.find((r) => r.tier === "Peak");
    const offRow = rows.find((r => r.tier === "Off-Peak"));
    const baseRow =
      rows.find((r) => r.tier !== "Peak" && r.tier !== "Off-Peak") ?? rows[0];
    const peakNow = isPeakNow(snapshot, selected);
    return { rows, usage, remainingUsd, peakRow, offRow, baseRow, peakNow };
  }, [snapshot, selected, estimate]);

  const usedPct = estimate?.estUsedPct ?? null;
  const barPct = usedPct != null ? Math.min(100, Math.max(0, usedPct)) : 0;
  const delta =
    usedPct != null && estimate?.officialMonthlyPct != null
      ? Math.round((usedPct - estimate.officialMonthlyPct) * 10) / 10
      : null;

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
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <Text variant="secondary" as="span">
                {t("estUsed")}
              </Text>
              <span
                className={`font-medium tabular-nums ${usageTextColor(barPct)}`}
              >
                {usedPct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-kumo-recessed">
              <div
                className={`h-full rounded-full transition-all ${usageBarColor(barPct)}`}
                style={{ width: `${Math.max(barPct, 2)}%` }}
              />
            </div>
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
            </div>
          </div>

          {estimate.models.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              <select
                className="self-start rounded-md border border-kumo-line bg-kumo-elevated px-2 py-1.5 text-xs"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                aria-label={t("colModel")}
              >
                {estimate.models.map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.model}
                  </option>
                ))}
              </select>

              {projection ? (
                <div className="flex flex-col gap-1 text-xs">
                  {projection.offRow && projection.peakRow ? (
                    <>
                      <span className="text-kumo-default">
                        {t("estOffPeak", {
                          req: fmtReq(projection.remainingUsd / costPerReq(projection.offRow)),
                          tok: fmtTok(
                            (projection.remainingUsd / costPerReq(projection.offRow)) *
                              patternTokens(projection.offRow)
                          ),
                        })}
                        {!projection.peakNow ? (
                          <span className="ml-1 text-kumo-subtle">
                            · {t("estNow")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-kumo-default">
                        {t("estPeak", {
                          req: fmtReq(projection.remainingUsd / costPerReq(projection.peakRow)),
                          tok: fmtTok(
                            (projection.remainingUsd / costPerReq(projection.peakRow)) *
                              patternTokens(projection.peakRow)
                          ),
                        })}
                        {projection.peakNow ? (
                          <span className="ml-1 text-kumo-warning">
                            · {t("estNow")}
                          </span>
                        ) : null}
                      </span>
                    </>
                  ) : projection.baseRow ? (
                    <span className="text-kumo-default">
                      {t("estProjection", {
                        req: fmtReq(projection.remainingUsd / costPerReq(projection.baseRow)),
                        tok: fmtTok(
                          (projection.remainingUsd / costPerReq(projection.baseRow)) *
                            patternTokens(projection.baseRow)
                        ),
                      })}
                    </span>
                  ) : null}
                  {selectedRow?.usage != null ? (
                    <span className="text-kumo-subtle">
                      ${(Math.round(projection.remainingUsd * 100) / 100).toFixed(2)} / ${selectedRow.usage}
                    </span>
                  ) : null}
                </div>
              ) : (
                <Text variant="secondary" as="p" DANGEROUS_className="m-0 text-xs">
                  {t("estNoPrices")}
                </Text>
              )}
            </div>
          ) : (
            <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-3 text-sm">
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

          <Text variant="secondary" as="p" DANGEROUS_className="m-0 mt-2 text-[11px]">
            {t("estPriceFrom", {
              date: new Date(estimate.priceFetchedAt ?? snapshot.fetchedAt).toLocaleDateString(
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
