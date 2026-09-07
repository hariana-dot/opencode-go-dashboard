export interface UsageWindow {
  usagePercent: number;
  resetInSec: number;
}

export interface UsageResult {
  rolling: UsageWindow | null;
  weekly: UsageWindow | null;
  monthly: UsageWindow | null;
  plan: string | null;
  fetchedAt: string;
  error?: string;
}

export interface AccountRow {
  id: string;
  name: string;
  workspace_id: string;
  auth_cookie: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface AccountPublic {
  id: string;
  name: string;
  workspaceId: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  hasCookie: boolean;
}

export interface AccountWithUsage extends AccountPublic {
  usage: UsageResult | null;
  loading?: boolean;
}

export interface CreateAccountBody {
  name: string;
  workspaceId: string;
  authCookie: string;
  notes?: string;
}

export interface UpdateAccountBody {
  name?: string;
  workspaceId?: string;
  authCookie?: string;
  notes?: string;
}

export interface UsageHistoryItem {
  id: string;
  timeCreated: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number | null;
  cacheWrite1hTokens: number | null;
  cost: number;
  keyID: string;
  sessionID: string;
  plan: string | null;
}

export interface UsageHistoryResult {
  items: UsageHistoryItem[];
  fetchedAt: string;
  cursor: number;
  error?: string;
}

export interface UsageSyncResult {
  inserted: number;
  nextCursor: number;
  done: boolean;
  oldest: string | null;
  lastSyncedAt: string | null;
  error?: string;
}

export interface UsageDayModelCost {
  date: string;
  model: string;
  cost: number;
}

export interface UsageOverviewResult {
  year: number;
  month: number;
  daysInMonth: number;
  series: UsageDayModelCost[];
  models: string[];
  keys: string[];
  lastSyncedAt: string | null;
}

export interface PriceSnapshotRow {
  fetched_at: string;
  snapshot_date: string;
  monthly_credit: number;
  monthly_cost: number;
  payload: string | null;
}

export interface ModelUsageDayRow {
  snapshot_date: string;
  model_suffix: string;
  usage: number;
}

export interface EstimateModelRow {
  model: string;
  usage: number | null;
  burnedFraction: number;
  requests: number;
}

export interface DailyBurnPoint {
  date: string;
  fraction: number;
}

export interface EstimateResult {
  windowStart: string;
  windowLengthMs: number;
  estUsedPct: number | null;
  estRemainingPct: number | null;
  officialMonthlyPct: number | null;
  officialResetInSec: number | null;
  dailyBurn: DailyBurnPoint[];
  models: EstimateModelRow[];
  unmappedModels: { model: string; requests: number }[];
  unmappedRequests: number;
  approxRequests: number;
  priceFetchedAt: string | null;
}

export interface PricingPayload {
  fetchedAt: string;
  monthlyCredit: number;
  monthlyCost: number;
  peakHours?: Record<string, [number, number][]>;
  models: PricingModelRow[];
  freeModels?: { id: string }[];
}

export interface PricingModelRow {
  id: string;
  name?: string;
  tier?: string | null;
  input?: number;
  output?: number;
  cachedRead?: number;
  cachedWrite?: number | null;
  usage: number;
  pattern?: { input: number; cachedRead: number; output: number };
  multiplier?: number;
  contextWindow?: number;
  provider?: string;
}