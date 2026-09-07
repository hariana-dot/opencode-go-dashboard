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
  listModelUsageDays,
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
  EstimateResult,
  PricingPayload,
  UpdateAccountBody,
  UsageHistoryItem,
  UsageResult,
} from "./types";

const SYNC_PAGES_PER_REQUEST = 2;
const HISTORY_PAGE_FULL = 40;
const ESTIMATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const COST_SCALE = 1_000_000_000;
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
      return handleApi(request, env, url);
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
  const cursorParam = Number(url.searchParams.get("cursor") ?? "0");
  let cursor =
    Number.isFinite(cursorParam) && cursorParam >= 0 ? cursorParam : 0;

  const until = url.searchParams.get("until");
  const row = await getAccountRow(env.DB, id);
  if (!row) return json({ error: "账号不存在" }, 404);

  let inserted = 0;
  let done = false;
  let oldest: string | null = null;
  let lastSyncedAt: string | null = null;
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
      for (const item of history.items) {
        if (!oldest || item.timeCreated < oldest) oldest = item.timeCreated;
      }
      cursor += 1;
      lastSyncedAt = await saveUsageSync(env.DB, id, cursor);
      if (history.items.length < HISTORY_PAGE_FULL) {
        done = true;
        break;
      }
      if (until && oldest && oldest < until) {
        done = true;
        break;
      }
    }
    if (!lastSyncedAt) lastSyncedAt = await saveUsageSync(env.DB, id, cursor);
    return json({
      inserted,
      nextCursor: cursor,
      done,
      oldest,
      lastSyncedAt,
    });
  } catch (err) {
    return json({
      inserted,
      nextCursor: cursor,
      done: false,
      oldest,
      lastSyncedAt,
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

  const snap = await getLatestPriceSnapshot(env.DB);
  const payload = parsePayload(snap?.payload ?? null);
  const free = new Set<string>(EXTRA_FREE_SUFFIXES);
  for (const item of payload?.freeModels ?? []) {
    const suffix = suffixOf(String(item?.id ?? ""));
    if (suffix) free.add(suffix);
  }

  const usageDays = await listModelUsageDays(env.DB);
  const usageByModel = new Map<string, { date: string; usage: number }[]>();
  for (const day of usageDays) {
    const list = usageByModel.get(day.model_suffix) ?? [];
    list.push({ date: day.snapshot_date, usage: day.usage });
    usageByModel.set(day.model_suffix, list);
  }
  for (const list of usageByModel.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  function usageAt(
    suffix: string,
    day: string
  ): { usage: number; approx: boolean } | null {
    const list = usageByModel.get(suffix);
    if (!list || list.length === 0) return null;
    let found: { date: string; usage: number } | null = null;
    for (const item of list) {
      if (item.date <= day) found = item;
      else break;
    }
    let approx = false;
    if (!found) {
      found = list[0];
      approx = true;
    }
    return { usage: found.usage, approx };
  }

  const { results } = await env.DB.prepare(
    `SELECT model, substr(time_created, 1, 10) AS day, SUM(cost) AS cost, COUNT(*) AS n
     FROM usage_records
     WHERE account_id = ? AND time_created >= ?
     GROUP BY model, day`
  )
    .bind(id, windowStart)
    .all<{ model: string; day: string; cost: number; n: number }>();

  interface Acc {
    requests: number;
    burned: number;
    approx: number;
    usage: number | null;
  }
  const acc = new Map<string, Acc>();
  const unmapped = new Map<string, number>();
  let approxRequests = 0;
  let unmappedRequests = 0;
  let totalBurned = 0;

  for (const group of results ?? []) {
    const suffix = suffixOf(group.model);
    const requests = Number(group.n);
    const costUsd = Number(group.cost) / COST_SCALE;
    if (free.has(suffix)) continue;
    const rate = usageAt(suffix, group.day);
    if (!rate) {
      unmapped.set(group.model, (unmapped.get(group.model) ?? 0) + requests);
      unmappedRequests += requests;
      continue;
    }
    const entry =
      acc.get(suffix) ??
      ({ requests: 0, burned: 0, approx: 0, usage: rate.usage } as Acc);
    entry.requests += requests;
    entry.burned += costUsd / rate.usage;
    if (rate.approx) {
      entry.approx += requests;
      approxRequests += requests;
    }
    acc.set(suffix, entry);
  }

  for (const entry of acc.values()) {
    totalBurned += entry.burned;
  }

  const models = [...acc.entries()]
    .map(([model, entry]) => ({
      model,
      usage: entry.usage,
      burnedFraction: entry.burned,
      requests: entry.requests,
    }))
    .sort((a, b) => b.burnedFraction - a.burnedFraction);

  const estimate: EstimateResult = {
    windowStart,
    estUsedPct: snap ? Math.round(totalBurned * 1000) / 10 : null,
    estRemainingPct: snap
      ? Math.round(Math.max(0, 1 - totalBurned) * 1000) / 10
      : null,
    officialMonthlyPct: monthly?.usagePercent ?? null,
    officialResetInSec: monthly?.resetInSec ?? null,
    models,
    unmappedModels: [...unmapped.entries()].map(([model, requests]) => ({
      model,
      requests,
    })),
    unmappedRequests,
    approxRequests,
    priceFetchedAt: snap?.fetched_at ?? null,
  };
  return json({ id, estimate });
}