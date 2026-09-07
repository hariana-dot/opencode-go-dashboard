import type {
  AccountPublic,
  AccountRow,
  CreateAccountBody,
  ModelUsageDayRow,
  PriceSnapshotRow,
  UpdateAccountBody,
  UsageHistoryItem,
  UsageOverviewResult,
} from "./types";

export function suffixOf(id: string): string {
  const i = id.lastIndexOf("/");
  return (i >= 0 ? id.slice(i + 1) : id).toLowerCase();
}

function toPublic(row: AccountRow): AccountPublic {
  return {
    id: row.id,
    name: row.name,
    workspaceId: row.workspace_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasCookie: Boolean(row.auth_cookie),
  };
}

export async function listAccounts(db: D1Database): Promise<AccountPublic[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, workspace_id, auth_cookie, notes, created_at, updated_at FROM accounts ORDER BY name COLLATE NOCASE"
    )
    .all<AccountRow>();
  return (results ?? []).map(toPublic);
}

export async function getAccountRow(
  db: D1Database,
  id: string
): Promise<AccountRow | null> {
  return db
    .prepare(
      "SELECT id, name, workspace_id, auth_cookie, notes, created_at, updated_at FROM accounts WHERE id = ?"
    )
    .bind(id)
    .first<AccountRow>();
}

export async function createAccount(
  db: D1Database,
  body: CreateAccountBody
): Promise<AccountPublic> {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO accounts (id, name, workspace_id, auth_cookie, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      body.name.trim(),
      body.workspaceId.trim(),
      body.authCookie.trim(),
      (body.notes ?? "").trim(),
      now,
      now
    )
    .run();

  const row = await getAccountRow(db, id);
  if (!row) throw new Error("创建账号失败");
  return toPublic(row);
}

export async function updateAccount(
  db: D1Database,
  id: string,
  body: UpdateAccountBody
): Promise<AccountPublic | null> {
  const existing = await getAccountRow(db, id);
  if (!existing) return null;

  const now = Date.now();
  await db
    .prepare(
      "UPDATE accounts SET name = ?, workspace_id = ?, auth_cookie = ?, notes = ?, updated_at = ? WHERE id = ?"
    )
    .bind(
      body.name?.trim() ?? existing.name,
      body.workspaceId?.trim() ?? existing.workspace_id,
      body.authCookie?.trim() ? body.authCookie.trim() : existing.auth_cookie,
      body.notes !== undefined ? body.notes.trim() : existing.notes,
      now,
      id
    )
    .run();

  const row = await getAccountRow(db, id);
  return row ? toPublic(row) : null;
}

export async function deleteAccount(
  db: D1Database,
  id: string
): Promise<boolean> {
  await db.prepare("DELETE FROM usage_records WHERE account_id = ?").bind(id).run();
  await db.prepare("DELETE FROM usage_sync WHERE account_id = ?").bind(id).run();
  const result = await db
    .prepare("DELETE FROM accounts WHERE id = ?")
    .bind(id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function upsertUsageRecords(
  db: D1Database,
  accountId: string,
  items: UsageHistoryItem[]
): Promise<number> {
  if (items.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO usage_records (
      id, account_id, time_created, model, provider,
      input_tokens, output_tokens, reasoning_tokens, cache_read_tokens,
      cache_write_5m_tokens, cache_write_1h_tokens, cost, key_id, session_id, plan
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, id) DO UPDATE SET
      time_created = excluded.time_created,
      model = excluded.model,
      provider = excluded.provider,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_tokens = excluded.reasoning_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_5m_tokens = excluded.cache_write_5m_tokens,
      cache_write_1h_tokens = excluded.cache_write_1h_tokens,
      cost = excluded.cost,
      key_id = excluded.key_id,
      session_id = excluded.session_id,
      plan = excluded.plan`
  );
  const batch = items.map((item) =>
    stmt.bind(
      item.id,
      accountId,
      item.timeCreated,
      item.model,
      item.provider,
      item.inputTokens,
      item.outputTokens,
      item.reasoningTokens,
      item.cacheReadTokens,
      item.cacheWrite5mTokens,
      item.cacheWrite1hTokens,
      item.cost,
      item.keyID,
      item.sessionID,
      item.plan
    )
  );
  await db.batch(batch);
  return items.length;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export async function getUsageOverview(
  db: D1Database,
  accountId: string,
  year: number,
  month: number
): Promise<UsageOverviewResult> {
  const start = `${year}-${pad(month)}-01T00:00:00.000Z`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${pad(endMonth)}-01T00:00:00.000Z`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const { results } = await db
    .prepare(
      `SELECT substr(time_created, 1, 10) AS day, model, key_id, SUM(cost) AS cost
       FROM usage_records
       WHERE account_id = ? AND time_created >= ? AND time_created < ?
       GROUP BY day, model, key_id`
    )
    .bind(accountId, start, end)
    .all<{ day: string; model: string; key_id: string; cost: number }>();

  const rows = results ?? [];
  const modelSet = new Set<string>();
  const keySet = new Set<string>();
  const merged = new Map<string, number>();

  for (const row of rows) {
    if (row.model) modelSet.add(row.model);
    if (row.key_id) keySet.add(row.key_id);
    const key = `${row.day}\t${row.model}`;
    merged.set(key, (merged.get(key) ?? 0) + Number(row.cost ?? 0));
  }

  const series = [...merged.entries()].map(([key, cost]) => {
    const [date, model] = key.split("\t");
    return { date, model, cost };
  });

  let sync: { lastSyncedAt: string | null } = { lastSyncedAt: null };
  try {
    sync = await getUsageSync(db, accountId);
  } catch {
    sync = { lastSyncedAt: null };
  }
  return {
    year,
    month,
    daysInMonth,
    series,
    models: [...modelSet].sort(),
    keys: [...keySet].sort(),
    lastSyncedAt: sync.lastSyncedAt,
  };
}
export async function getLatestPriceSnapshot(
  db: D1Database
): Promise<PriceSnapshotRow | null> {
  return db
    .prepare(
      "SELECT fetched_at, snapshot_date, monthly_credit, monthly_cost, payload FROM price_snapshots ORDER BY fetched_at DESC LIMIT 1"
    )
    .first<PriceSnapshotRow>();
}

export async function countPriceSnapshots(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM price_snapshots")
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function insertPriceSnapshot(
  db: D1Database,
  data: {
    fetchedAt: string;
    snapshotDate: string;
    monthlyCredit: number;
    monthlyCost: number;
    payload: string | null;
  }
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO price_snapshots (fetched_at, snapshot_date, monthly_credit, monthly_cost, payload)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(fetched_at) DO NOTHING`
    )
    .bind(
      data.fetchedAt,
      data.snapshotDate,
      data.monthlyCredit,
      data.monthlyCost,
      data.payload
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updatePricePayload(
  db: D1Database,
  fetchedAt: string,
  payload: string
): Promise<void> {
  await db
    .prepare("UPDATE price_snapshots SET payload = ? WHERE fetched_at = ?")
    .bind(payload, fetchedAt)
    .run();
}

export async function listModelUsageDays(
  db: D1Database
): Promise<ModelUsageDayRow[]> {
  const { results } = await db
    .prepare("SELECT snapshot_date, model_suffix, usage FROM model_usage_days")
    .all<ModelUsageDayRow>();
  return results ?? [];
}

export async function listUsedModelSuffixes(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT model FROM usage_records")
    .all<{ model: string }>();
  return (results ?? []).map((r) => suffixOf(r.model));
}

export interface UsageSyncState {
  lastSyncedAt: string | null;
  lastCursor: number;
  oldestSyncedAt: string | null;
  lastRecordAt: string | null;
}

export async function getUsageSync(
  db: D1Database,
  accountId: string
): Promise<UsageSyncState> {
  const row = await db
    .prepare(
      "SELECT last_synced_at, last_cursor, oldest_synced_at, last_record_at FROM usage_sync WHERE account_id = ?"
    )
    .bind(accountId)
    .first<{
      last_synced_at: string | null;
      last_cursor: number;
      oldest_synced_at: string | null;
      last_record_at: string | null;
    }>();
  return {
    lastSyncedAt: row?.last_synced_at ?? null,
    lastCursor: row?.last_cursor ?? 0,
    oldestSyncedAt: row?.oldest_synced_at ?? null,
    lastRecordAt: row?.last_record_at ?? null,
  };
}

export async function saveUsageSync(
  db: D1Database,
  accountId: string,
  data: {
    cursor: number;
    oldestSyncedAt: string | null;
    lastRecordAt: string | null;
  }
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO usage_sync (account_id, last_synced_at, last_cursor, oldest_synced_at, last_record_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         last_synced_at = excluded.last_synced_at,
         last_cursor = excluded.last_cursor,
         oldest_synced_at = COALESCE(
           MIN(usage_sync.oldest_synced_at, excluded.oldest_synced_at),
           usage_sync.oldest_synced_at,
           excluded.oldest_synced_at
         ),
         last_record_at = excluded.last_record_at`
    )
    .bind(
      accountId,
      now,
      data.cursor,
      data.oldestSyncedAt,
      data.lastRecordAt
    )
    .run();
  return now;
}
