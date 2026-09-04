import { Button, Dialog, Loader, Text } from "@cloudflare/kumo";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { fetchUsageHistory } from "../lib/api";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import { COST_SCALE, type UsageHistoryItem, type UsageHistoryResult } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  accountId: string;
}

const PAGE_STEP = 1;

function formatTokens(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

function formatCost(cost: number): string {
  const usd = cost / COST_SCALE;
  return `$${usd.toFixed(6)}`;
}

function cacheRate(item: UsageHistoryItem): string {
  const denom = item.inputTokens + item.cacheReadTokens;
  if (denom === 0) return "—";
  return `${((item.cacheReadTokens / denom) * 100).toFixed(1)}%`;
}

export default function HistoryDialog({
  open,
  onOpenChange,
  accountName,
  accountId,
}: Props) {
  const { locale, t } = usePrefs();
  const [data, setData] = useState<UsageHistoryResult | null>(null);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setData(null);
      setCursor(0);
      setError("");
    }
  }, [open, accountId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchUsageHistory(accountId, cursor);
        if (cancelled) return;
        setData(res);
        if (res.error) setError(res.error);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("historyFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, cursor, t]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="max-w-5xl p-6">
        <Dialog.Title>{t("historyTitle", { name: accountName })}</Dialog.Title>
        <Dialog.Description className="mt-1">
          {t("historyHint")}
        </Dialog.Description>

        <div className="mt-4 max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-kumo-subtle">
              <Loader />
              {t("loadingHistory")}
            </div>
          ) : error ? (
            <Text
              variant="secondary"
              as="p"
              DANGEROUS_className="m-0 text-sm text-kumo-danger"
            >
              {error}
            </Text>
          ) : data && data.items.length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-kumo-subtle">
                  <th className="border-b border-kumo-line px-2 py-2">
                    {t("colTime")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2">
                    {t("colModel")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colInput")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colOutput")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colReasoning")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colCacheRead")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colCacheRate")}
                  </th>
                  <th className="border-b border-kumo-line px-2 py-2 text-right">
                    {t("colCost")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: UsageHistoryItem) => (
                  <tr key={item.id} className="align-top">
                    <td className="border-b border-kumo-line px-2 py-2 whitespace-nowrap tabular-nums">
                      {new Date(item.timeCreated).toLocaleString(
                        localeTag(locale)
                      )}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2">
                      <div className="font-mono text-xs">{item.model}</div>
                      <div className="text-xs text-kumo-subtle">
                        {item.provider}
                        {item.plan ? ` · ${item.plan}` : ""}
                      </div>
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.inputTokens, localeTag(locale))}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.outputTokens, localeTag(locale))}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.reasoningTokens, localeTag(locale))}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatTokens(item.cacheReadTokens, localeTag(locale))}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {cacheRate(item)}
                    </td>
                    <td className="border-b border-kumo-line px-2 py-2 text-right tabular-nums">
                      {formatCost(item.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Text variant="secondary" as="p" DANGEROUS_className="m-0 text-sm">
              {t("noHistory")}
            </Text>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-kumo-subtle">
            <Button
              variant="secondary"
              size="sm"
              icon={CaretLeft}
              onClick={() => setCursor((c) => Math.max(0, c - PAGE_STEP))}
              disabled={loading || cursor === 0}
            >
              {t("prevPage")}
            </Button>
            <span className="tabular-nums">{t("pageN", { n: cursor + 1 })}</span>
            <Button
              variant="secondary"
              size="sm"
              icon={CaretRight}
              onClick={() => setCursor((c) => c + PAGE_STEP)}
              disabled={
                loading ||
                !data ||
                data.items.length === 0 ||
                Boolean(data?.error)
              }
            >
              {t("nextPage")}
            </Button>
          </div>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
