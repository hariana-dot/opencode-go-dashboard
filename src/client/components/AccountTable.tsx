import { Button, Text } from "@cloudflare/kumo";
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { localeTag } from "../lib/i18n";
import { usePrefs } from "../lib/prefs";
import type { AccountWithUsage } from "../types";
import CostChart from "./CostChart";
import UsageBar from "./UsageBar";

interface Props {
  accounts: AccountWithUsage[];
  refreshingIds: Set<string>;
  chartToken: number;
  onRefresh: (id: string) => void;
  onEdit: (account: AccountWithUsage) => void;
  onDelete: (account: AccountWithUsage) => void;
  onHistory: (account: AccountWithUsage) => void;
}

export default function AccountTable({
  accounts,
  refreshingIds,
  chartToken,
  onRefresh,
  onEdit,
  onDelete,
  onHistory,
}: Props) {
  const { locale, t } = usePrefs();

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-elevated p-10 text-center">
        <Text variant="secondary" as="p" DANGEROUS_className="m-0">
          {t("emptyAccounts")}
        </Text>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {accounts.map((account) => {
        const refreshing = refreshingIds.has(account.id);
        const usage = account.usage;
        const hasError = Boolean(usage?.error);

        return (
          <article
            key={account.id}
            className="rounded-lg border border-kumo-line bg-kumo-elevated p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Text variant="heading3" as="h2" DANGEROUS_className="m-0">
                  {account.name}
                </Text>
                <Text
                  variant="secondary"
                  as="p"
                  DANGEROUS_className="m-0 mt-1 font-mono text-xs"
                >
                  {account.workspaceId}
                  {usage?.plan ? ` · ${usage.plan}` : ""}
                </Text>
                {account.notes ? (
                  <Text
                    variant="secondary"
                    as="p"
                    DANGEROUS_className="m-0 mt-1 text-sm"
                  >
                    {account.notes}
                  </Text>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ArrowsClockwise}
                  onClick={() => onRefresh(account.id)}
                  disabled={refreshing}
                >
                  {refreshing ? t("querying") : t("refresh")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ClockCounterClockwise}
                  onClick={() => onHistory(account)}
                >
                  {t("history")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={PencilSimple}
                  onClick={() => onEdit(account)}
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Trash}
                  onClick={() => onDelete(account)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {hasError ? (
                <Text
                  variant="secondary"
                  as="p"
                  DANGEROUS_className="m-0 text-sm text-kumo-danger"
                >
                  {usage?.error}
                </Text>
              ) : usage ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <UsageBar label={t("rolling")} data={usage.rolling} />
                  <UsageBar label={t("weekly")} data={usage.weekly} />
                  <UsageBar label={t("monthly")} data={usage.monthly} />
                </div>
              ) : (
                <Text variant="secondary" as="p" DANGEROUS_className="m-0 text-sm">
                  {t("notQueried")}
                </Text>
              )}

              {usage?.fetchedAt && !hasError ? (
                <Text
                  variant="secondary"
                  as="p"
                  DANGEROUS_className="m-0 mt-3 text-[11px]"
                >
                  {t("updatedAt", {
                    time: new Date(usage.fetchedAt).toLocaleString(
                      localeTag(locale)
                    ),
                  })}
                </Text>
              ) : null}

              <CostChart accountId={account.id} refreshToken={chartToken} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
