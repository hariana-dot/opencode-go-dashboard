import type {
  Account,
  AccountFormData,
  AccountWithUsage,
  EstimateResult,
  PriceSnapshotData,
  UsageHistoryResult,
  UsageOverviewResult,
  UsageResult,
  UsageSyncResult,
} from "../types";

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const ctrl = new AbortController();
  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => ctrl.abort(), timeoutMs)
      : undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: rest.signal ?? ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...rest.headers,
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data: T & { error?: string };
  try {
    data = (await res.json()) as T & { error?: string };
  } catch {
    if (!res.ok) {
      throw new Error(`请求失败 (HTTP ${res.status})`);
    }
    throw new Error("响应格式异常，非 JSON 内容");
  }
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败 (${res.status})`);
  }
  return data;
}

export async function checkAuth(): Promise<boolean> {
  const data = await request<{ authenticated: boolean }>("/api/auth/status");
  return data.authenticated;
}

export async function login(password: string): Promise<void> {
  await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

export async function fetchAccounts(): Promise<Account[]> {
  const data = await request<{ accounts: Account[] }>("/api/accounts");
  return data.accounts;
}

export async function createAccount(form: AccountFormData): Promise<Account> {
  const data = await request<{ account: Account }>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return data.account;
}

export async function updateAccount(
  id: string,
  form: Partial<AccountFormData>
): Promise<Account> {
  const data = await request<{ account: Account }>(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(form),
  });
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  await request(`/api/accounts/${id}`, { method: "DELETE" });
}

export async function refreshAll(
  ids?: string[]
): Promise<AccountWithUsage[]> {
  const data = await request<{ accounts: AccountWithUsage[] }>("/api/refresh", {
    method: "POST",
    body: JSON.stringify(ids?.length ? { ids } : {}),
  });
  return data.accounts;
}

export async function refreshOne(id: string): Promise<UsageResult> {
  const data = await request<{ id: string; usage: UsageResult }>(
    `/api/accounts/${id}/refresh`,
    { method: "POST" }
  );
  return data.usage;
}

export async function fetchUsageHistory(
  id: string,
  cursor: number = 0
): Promise<UsageHistoryResult> {
  const data = await request<{ id: string; history: UsageHistoryResult }>(
    `/api/accounts/${id}/history?cursor=${encodeURIComponent(cursor)}`,
    { method: "GET" }
  );
  return data.history;
}

export async function syncUsageHistory(
  id: string,
  until: string
): Promise<UsageSyncResult> {
  return await request<UsageSyncResult>(
    `/api/accounts/${id}/sync?until=${encodeURIComponent(until)}`,
    { method: "POST", timeoutMs: 30000 }
  );
}

export async function fetchUsageOverview(
  id: string,
  year: number,
  month: number
): Promise<UsageOverviewResult> {
  const data = await request<{ id: string; overview: UsageOverviewResult }>(
    `/api/accounts/${id}/overview?year=${year}&month=${month}`
  );
  return data.overview;
}

export async function fetchEstimate(id: string): Promise<EstimateResult> {
  const data = await request<{ id: string; estimate: EstimateResult }>(
    `/api/accounts/${id}/estimate`
  );
  return data.estimate;
}

let priceCache: {
  at: number;
  snapshot: PriceSnapshotData | null;
  stale: boolean;
} | null = null;

export async function getPriceSnapshot(): Promise<PriceSnapshotData | null> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60_000) {
    return priceCache.snapshot;
  }
  let res = await request<{
    snapshot: PriceSnapshotData | null;
    stale: boolean;
  }>("/api/prices/latest");
  if (res.stale) {
    try {
      await request("/api/prices/refresh", {
        method: "POST",
        timeoutMs: 60000,
      });
      res = await request<{
        snapshot: PriceSnapshotData | null;
        stale: boolean;
      }>("/api/prices/latest");
    } catch {
      // keep the stale snapshot rather than failing the whole view
    }
  }
  priceCache = { at: Date.now(), snapshot: res.snapshot, stale: res.stale };
  return res.snapshot;
}