import {
  countPriceSnapshots,
  insertPriceSnapshot,
  listUsedModelSuffixes,
  suffixOf,
  updatePricePayload,
} from "./db";
import type { PricingPayload } from "./types";

const LATEST_URL = "https://ocgo-pricing.all-the.rest/data/latest.json";
const HISTORY_URL = "https://ocgo-pricing.all-the.rest/data/history.json";
const EXTRA_FREE_SUFFIXES = new Set(["big-pickle"]);

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "opencode-go-dashboard/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`价格源请求失败 (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

function extractUsageMap(data: PricingPayload): Map<string, number> {
  const map = new Map<string, number>();
  for (const model of data.models ?? []) {
    const suffix = suffixOf(String(model.id ?? ""));
    if (!suffix || typeof model.usage !== "number" || model.usage <= 0) {
      continue;
    }
    map.set(suffix, Math.max(map.get(suffix) ?? 0, model.usage));
  }
  return map;
}

async function batchChunks(
  db: D1Database,
  stmts: D1PreparedStatement[]
): Promise<void> {
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

async function ingestOne(
  db: D1Database,
  data: PricingPayload,
  usedSuffixes: Set<string>,
  withPayload: boolean
): Promise<boolean> {
  const fetchedAt = String(data.fetchedAt);
  const snapshotDate = fetchedAt.slice(0, 10);
  const inserted = await insertPriceSnapshot(db, {
    fetchedAt,
    snapshotDate,
    monthlyCredit: Number(data.monthlyCredit) || 60,
    monthlyCost: Number(data.monthlyCost) || 10,
    payload: withPayload ? JSON.stringify(data) : null,
  });
  if (!inserted) {
    if (withPayload) {
      await updatePricePayload(db, fetchedAt, JSON.stringify(data));
    }
    return false;
  }

  const usage = extractUsageMap(data);
  const upsert = db.prepare(
    `INSERT INTO model_usage_days (snapshot_date, model_suffix, usage)
     VALUES (?, ?, ?)
     ON CONFLICT(snapshot_date, model_suffix) DO UPDATE SET usage = excluded.usage`
  );
  const stmts: D1PreparedStatement[] = [];
  for (const [suffix, value] of usage) {
    if (!usedSuffixes.has(suffix)) continue;
    stmts.push(upsert.bind(snapshotDate, suffix, value));
  }
  if (stmts.length > 0) {
    await batchChunks(db, stmts);
  }
  return true;
}

async function backfillHistory(
  db: D1Database,
  usedSuffixes: Set<string>
): Promise<void> {
  const json = await fetchJson<{ snapshots?: PricingPayload[] }>(HISTORY_URL);
  const snapshots = (json.snapshots ?? [])
    .filter((s) => s?.fetchedAt && Array.isArray(s.models))
    .sort((a, b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt)));
  for (const snapshot of snapshots) {
    await ingestOne(db, snapshot, usedSuffixes, false);
  }
}

export async function ingestLatestPrices(db: D1Database): Promise<void> {
  const data = await fetchJson<PricingPayload>(LATEST_URL);
  if (!data?.fetchedAt || !Array.isArray(data.models)) {
    throw new Error("价格源数据结构异常");
  }
  const usedSuffixes = new Set(await listUsedModelSuffixes(db));
  for (const extra of EXTRA_FREE_SUFFIXES) usedSuffixes.add(extra);
  if ((await countPriceSnapshots(db)) === 0) {
    try {
      await backfillHistory(db, usedSuffixes);
    } catch {
      // backfill is best-effort; latest snapshot still ingested below
    }
  }
  await ingestOne(db, data, usedSuffixes, true);
}
