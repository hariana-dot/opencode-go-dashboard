import type { Locale } from "./i18n";
import { localeTag, t } from "./i18n";

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

export function fmtDM(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function fmtDMY(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

const ISO_START_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const OFFSET_END_RE = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function parseServerDate(raw: string): Date {
  if (ISO_START_RE.test(raw) && !OFFSET_END_RE.test(raw)) {
    return new Date(`${raw.replace(" ", "T")}Z`);
  }
  return new Date(raw);
}

export function fmtDateTime(raw: string, locale: Locale): string {
  const date = parseServerDate(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${fmtDMY(date)}, ${date.toLocaleTimeString(localeTag(locale))}`;
}
