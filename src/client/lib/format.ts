import type { Locale } from "./i18n";
import { t } from "./i18n";

export function formatDuration(seconds: number, locale: Locale): string {
  if (seconds < 60) return t(locale, "sec", { n: seconds });
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return t(locale, "min", { n: mins });
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0
      ? t(locale, "hourMin", { h: hours, m: mins })
      : t(locale, "hour", { n: hours });
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0
    ? t(locale, "dayHour", { d: days, h: hours })
    : t(locale, "day", { n: days });
}

export function usageStatus(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 75) return "danger";
  if (percent >= 50) return "warn";
  return "ok";
}

export function usageBarColor(percent: number): string {
  const status = usageStatus(percent);
  if (status === "danger") return "bg-kumo-danger";
  if (status === "warn") return "bg-kumo-warning";
  return "bg-kumo-success";
}

export function usageTextColor(percent: number): string {
  const status = usageStatus(percent);
  if (status === "danger") return "text-kumo-danger";
  if (status === "warn") return "text-kumo-warning";
  return "text-kumo-success";
}
