import {
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  sessionCookie,
} from "./auth";
import {
  createAccount,
  deleteAccount,
  getAccountRow,
  getLatestPriceSnapshot,
  getUsageOverview,
  listAccounts,
  getUsageSync,
  saveUsageSync,
  suffixOf,
  updateAccount,
  upsertUsageRecords,
} from "./db";
import { ingestLatestPrices } from "./prices";
import {
  fetchGoQuota,
  fetchGoUsageHistory,
  validateAuthCookie,
  validateWorkspaceId,
} from "./quota";
import type {
  AccountWithUsage,
  CreateAccountBody,
  EstimateSpendRow,
  EstimateResult,
  PricingModelRow,
  PricingPayload,
  UpdateAccountBody,
  UsageHistoryItem,
  UsageResult,
} from "./types";

const SYNC_PAGES_PER_REQUEST = 3;
const HISTORY_PAGE_FULL = 40;
const ESTIMATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GLM_FLASH_RE = /^glm-\d+(?:\.\d+)*-flash$/;
const EXTRA_FREE_SUFFIXES = ["big-pickle"];

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error("api error", err);
        return json(
          { error: err instanceof Error ? err.message : "internal error" },
          500
        );
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      ingestLatestPrices(env.DB).catch((err) =>
        console.error("price ingest failed", err)
      )
    );
  },
} satisfies ExportedHandler<Env>;

async function handleApi(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: "服务未配置 ADMIN_PASSWORD" }, 500);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...JSON_HEADERS,
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    const authed = await isAuthenticated(request, env.ADMIN_PASSWORD);
    return json({ authenticated: authed });
  }

  const authed = await isAuthenticated(request, env.ADMIN_PASSWORD);
  if (!authed) {
    return json({ error: "未授权，请先登录" }, 401);
  }

  if (url.pathname === "/api/accounts") {
    if (request.method === "GET") return handleListAccounts(env);
    if (request.method === "POST") return handleCreateAccount(request, env);
  }

  const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch) {
    const id = accountMatch[1];
    if (request.method === "PUT") return handleUpdateAccount(request, env, id);
    if (request.method === "DELETE") return handleDeleteAccount(env, id);
  }

  const refreshMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/refresh$/);
  if (refreshMatch && request.method === "POST") {
    return handleRefreshOne(env, refreshMatch[1]);
  }

  const historyMatch = url.pathname.match(
    /^\/api\/accounts\/([^/]+)\/history$/
  );
  if (historyMatch && request.method === "GET") {
    return handleHistory(request, env, historyMatch[1]);
  }

  const syncMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/sync$/);
  if (syncMatch && request.method === "POST") {
    return handleSyncHistory(request, env, syncMatch[1]);
  }

  const overviewMatch = url.pathname.match(
    /^\/api\/accounts\/([^/]+)\/overview$/
  );
  if (overviewMatch && request.method === "GET") {
    return handleOverview(request, env, overviewMatch[1]);
  }

  const estimateMatch = url.pathname.match(
    /^\/api\/accounts\/([^/]+)\/estimate$/
  );
  if (estimateMatch && request.method === "GET") {
    return handleEstimate(env, estimateMatch[1]);
  }

  if (url.pathname === "/api/prices/latest" && request.method === "GET") {
    return handlePricesLatest(env);
  }

  if (url.pathname === "/api/prices/refresh" && request.method === "POST") {
    return handlePricesRefresh(env);
  }

  if (url.pathname === "/api/refresh" && request.method === "POST") {
    return handleRefreshAll(request, env);
  }

  return json({ error: "Not found" }, 404);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { password?: string };
    if (!body.password || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: "密码错误" }, 401);
    }
    const token = await createSessionToken(env.ADMIN_PASSWORD);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        ...JSON_HEADERS,
        "Set-Cookie": sessionCookie(token),
      },
    });
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }
}

async function handleListAccounts(env: Env): Promise<Response> {
  const accounts = await listAccounts(env.DB);
  return json({ accounts });
}

async function handleCreateAccount(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = (await request.json()) as CreateAccountBody;
    const nameError = !body.name?.trim() ? "名称不能为空" : null;
    const wsError = validateWorkspaceId(body.workspaceId ?? "");
    const cookieError = validateAuthCookie(body.authCookie ?? "");
    const error = nameError ?? wsError ?? cookieError;
    if (error) return json({ error }, 400);

    const account = await createAccount(env.DB, body);
    return json({ account }, 201);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "创建失败" },
      500
    );
  }
}

async function handleUpdateAccount(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  try {
    const body = (await request.json()) as UpdateAccountBody;
    if (body.workspaceId) {
      const wsError = validateWorkspaceId(body.workspaceId);
      if (wsError) return json({ error: wsError }, 400);
    }
    if (body.authCookie) {
      const cookieError = validateAuthCookie(body.authCookie);
      if (cookieError) return json({ error: cookieError }, 400);
    }
    if (body.name !== undefined && !body.name.trim()) {
      return json({ error: "名称不能为空" }, 400);
    }

    const account = await updateAccount(env.DB, id, body);
    if (!account) return json({ error: "账号不存在" }, 404);
    return json({ account });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "更新失败" },
      500
    );
  }
}

async function handleDeleteAccount(env: Env, id: string): Promise<Response> {
  const ok = await deleteAccount(env.DB, id);
  if (!ok) return json({ error: "账号不存在" }, 404);
  return json({ ok: true });
}

async function handleRefreshOne(
  env: Env,
  id: string
): Promise<Response> {
  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  try {
    const usage = await fetchGoQuota(row.workspace_id, row.auth_cookie);
    return json({ id, usage });
  } catch (err) {
    const usage: UsageResult = {
      rolling: null,
      weekly: null,
      monthly: null,
      plan: null,
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "查询失败",
    };
    return json({ id, usage });
  }
}

async function handleRefreshAll(
  request: Request,
  env: Env
): Promise<Response> {
  let ids: string[] | null = null;
  try {
    const body = (await request.json()) as { ids?: string[] };
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      ids = body.ids;
    }
  } catch {
    // refresh all when body empty or invalid
  }

  const accounts = await listAccounts(env.DB);
  const targetIds = new Set(
    ids ?? accounts.map((a) => a.id)
  );

  const results: AccountWithUsage[] = await Promise.all(
    accounts
      .filter((a) => targetIds.has(a.id))
      .map(async (account) => {
        const row = await getAccountRow(env.DB, account.id);
        if (!row) {
          return { ...account, usage: null };
        }
        try {
          const usage = await fetchGoQuota(row.workspace_id, row.auth_cookie);
          return { ...account, usage };
        } catch (err) {
          const usage: UsageResult = {
            rolling: null,
            weekly: null,
            monthly: null,
            plan: null,
            fetchedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : "查询失败",
          };
          return { ...account, usage };
        }
      })
  );

  return json({ accounts: results });
}

async function handleHistory(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const url = new URL(request.url);
  const cursorParam = Number(url.searchParams.get("cursor") ?? "0");
  const cursor = Number.isFinite(cursorParam) && cursorParam >= 0 ? cursorParam : 0;

  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  try {
    const history = await fetchGoUsageHistory(
      row.workspace_id,
      row.auth_cookie,
      cursor
    );
    return json({ id, history });
  } catch (err) {
    const history = {
      items: [] as UsageHistoryItem[],
      fetchedAt: new Date().toISOString(),
      cursor,
      error: err instanceof Error ? err.message : "查询历史失败",
    };
    return json({ id, history });
  }
}

async function handleSyncHistory(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const url = new URL(request.url);
  const untilParam = url.searchParams.get("until");
  const until =
    untilParam ?? new Date(Date.now() - ESTIMATE_WINDOW_MS).toISOString();

  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  const sync = await getUsageSync(env.DB, id);

  let inserted = 0;
  let cursor = 0;
  let done = false;
  let oldestSeen: string | null = sync.oldestSyncedAt;
  let lastRecordAt = sync.lastRecordAt;
  try {
    for (let i = 0; i < SYNC_PAGES_PER_REQUEST; i++) {
      const history = await fetchGoUsageHistory(
        row.workspace_id,
        row.auth_cookie,
        cursor,
        true
      );
      if (history.items.length === 0) {
        done = true;
        break;
      }
      inserted += await upsertUsageRecords(env.DB, id, history.items);
      let pageOldest: string | null = null;
      for (const item of history.items) {
        if (!pageOldest || item.timeCreated < pageOldest) {
          pageOldest = item.timeCreated;
        }
      }
      if (pageOldest && (!oldestSeen || pageOldest < oldestSeen)) {
        oldestSeen = pageOldest;
      }
      cursor += 1;

      if (pageOldest && pageOldest <= until) {
        done = true;
        break;
      }
      if (
        pageOldest &&
        lastRecordAt &&
        pageOldest <= lastRecordAt &&
        oldestSeen &&
        oldestSeen <= until
      ) {
        done = true;
        break;
      }
      if (history.items.length < HISTORY_PAGE_FULL) {
        done = true;
        break;
      }
    }
    const maxRow = await env.DB
      .prepare(
        "SELECT MAX(time_created) AS m FROM usage_records WHERE account_id = ?"
      )
      .bind(id)
      .first<{ m: string | null }>();
    lastRecordAt = maxRow?.m ?? lastRecordAt;
    const lastSyncedAt = await saveUsageSync(env.DB, id, {
      cursor: 0,
      oldestSyncedAt: oldestSeen,
      lastRecordAt,
    });
    return json({ inserted, done, lastSyncedAt });
  } catch (err) {
    return json({
      inserted,
      done: false,
      lastSyncedAt: null,
      error: err instanceof Error ? err.message : "同步失败",
    });
  }
}

async function handleOverview(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const url = new URL(request.url);
  const now = new Date();
  const yearParam = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
  const monthParam = Number(
    url.searchParams.get("month") ?? now.getUTCMonth() + 1
  );
  const year =
    Number.isFinite(yearParam) && yearParam >= 2020 && yearParam <= 2100
      ? Math.floor(yearParam)
      : now.getUTCFullYear();
  const month =
    Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
      ? Math.floor(monthParam)
      : now.getUTCMonth() + 1;

  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  try {
    const overview = await getUsageOverview(env.DB, id, year, month);
    return json({ id, overview });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "查询概览失败" },
      500
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function parsePayload(raw: string | null): PricingPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PricingPayload;
  } catch {
    return null;
  }
}

async function handlePricesLatest(env: Env): Promise<Response> {
  const snap = await getLatestPriceSnapshot(env.DB);
  if (!snap) return json({ snapshot: null, stale: true });
  const stale = Date.now() - Date.parse(snap.fetched_at) > 12 * 3600 * 1000;
  const payload = parsePayload(snap.payload);
  return json({
    snapshot: payload
      ? {
          fetchedAt: snap.fetched_at,
          snapshotDate: snap.snapshot_date,
          monthlyCredit: snap.monthly_credit,
          monthlyCost: snap.monthly_cost,
          peakHours: payload.peakHours ?? null,
          models: payload.models ?? [],
          freeModels: payload.freeModels ?? null,
        }
      : null,
    stale,
  });
}

async function handlePricesRefresh(env: Env): Promise<Response> {
  try {
    await ingestLatestPrices(env.DB);
    return json({ ok: true });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : "同步价格失败" },
      502
    );
  }
}

interface PricedModel {
  suffix: string;
  usage: number;
  peakRow: PricingModelRow | null;
  offRow: PricingModelRow | null;
  baseRow: PricingModelRow | null;
  upRow: PricingModelRow | null;
  threshold: number;
  peakRanges: [number, number][];
}

function glmVersionParts(suffix: string): number[] {
  return (suffix.match(/\d+/g) ?? []).map(Number);
}

async function handleEstimate(env: Env, id: string): Promise<Response> {
  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  let official: UsageResult | null = null;
  try {
    official = await fetchGoQuota(row.workspace_id, row.auth_cookie);
  } catch {
    official = null;
  }
  const monthly = official?.monthly ?? null;

  const nowMs = Date.now();
  const windowStartMs =
    monthly?.resetInSec != null
      ? nowMs + monthly.resetInSec * 1000 - ESTIMATE_WINDOW_MS
      : nowMs - ESTIMATE_WINDOW_MS;
  const windowStart = new Date(windowStartMs).toISOString();
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const snap = await getLatestPriceSnapshot(env.DB);
  const payload = parsePayload(snap?.payload ?? null);

  const free = new Set<string>(EXTRA_FREE_SUFFIXES);
  for (const item of payload?.freeModels ?? []) {
    const suffix = suffixOf(String(item?.id ?? ""));
    if (suffix) free.add(suffix);
  }

  const pricedRows = new Map<string, PricingModelRow[]>();
  for (const model of payload?.models ?? []) {
    const suffix = suffixOf(String(model.id ?? ""));
    if (!suffix) continue;
    const list = pricedRows.get(suffix) ?? [];
    list.push(model);
    pricedRows.set(suffix, list);
  }

  let refSuffix = "";
  const glmCandidates = [...pricedRows.keys()].filter((s) =>
    GLM_FLASH_RE.test(s)
  );
  if (glmCandidates.length > 0) {
    glmCandidates.sort((a, b) => {
      const pa = glmVersionParts(a);
      const pb = glmVersionParts(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
    refSuffix = glmCandidates[glmCandidates.length - 1];
  }

  const { results } = await env.DB.prepare(
    `SELECT time_created, model, cost FROM usage_records
     WHERE account_id = ? AND time_created >= ?`
  )
    .bind(id, windowStart)
    .all<{ time_created: string; model: string; cost: number }>();
  const records = results ?? [];

  const usedSuffixes = new Set<string>();
  for (const rec of records) {
    const suffix = suffixOf(rec.model);
    if (free.has(suffix)) continue;
    if (!pricedRows.has(suffix)) continue;
    usedSuffixes.add(suffix);
  }

  const targets = new Set<string>(usedSuffixes);
  if (refSuffix) targets.add(refSuffix);

  const spend = new Map<string, Map<string, number>>();
  for (const rec of records) {
    const suffix = suffixOf(rec.model);
    if (!targets.has(suffix)) continue;
    const day = rec.time_created.slice(0, 10);
    const days = spend.get(suffix) ?? new Map<string, number>();
    days.set(day, (days.get(day) ?? 0) + Number(rec.cost ?? 0) / 1e9);
    spend.set(suffix, days);
  }

  const last7Days: string[] = [];
  for (let i = 1; i <= 7; i++) {
    last7Days.push(
      new Date(todayUtc.getTime() - i * DAY_MS).toISOString().slice(0, 10)
    );
  }

  function rowFor(suffix: string): EstimateSpendRow | null {
    const variants = pricedRows.get(suffix);
    if (!variants || variants.length === 0) return null;
    const usage = Math.max(...variants.map((r) => r.usage ?? 0));
    if (!(usage > 0)) return null;
    const days = spend.get(suffix);
    let sum7 = 0;
    for (const day of last7Days) sum7 += days?.get(day) ?? 0;
    return {
      model: suffix,
      usage,
      rate7UsdPerDay: Math.round((sum7 / 7) * 1e4) / 1e4,
    };
  }

  const rows: EstimateSpendRow[] = [];
  for (const suffix of usedSuffixes) {
    if (suffix === refSuffix) continue;
    const spendRow = rowFor(suffix);
    if (spendRow) rows.push(spendRow);
  }
  rows.sort((a, b) => {
    if (b.rate7UsdPerDay !== a.rate7UsdPerDay) {
      return b.rate7UsdPerDay - a.rate7UsdPerDay;
    }
    return a.model.localeCompare(b.model);
  });

  const ref = refSuffix ? rowFor(refSuffix) : null;

  const estimate: EstimateResult = {
    windowStart,
    windowLengthMs: ESTIMATE_WINDOW_MS,
    recordCount: records.length,
    officialMonthlyPct: monthly?.usagePercent ?? null,
    officialResetInSec: monthly?.resetInSec ?? null,
    rows,
    ref,
  };
  return json({ id, estimate });
}
