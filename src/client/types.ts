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

export interface Account {
  id: string;
  name: string;
  workspaceId: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  hasCookie: boolean;
}

export interface AccountWithUsage extends Account {
  usage: UsageResult | null;
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

export interface AccountFormData {
  name: string;
  workspaceId: string;
  authCookie: string;
  notes: string;
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

export interface UsageSyncResult {
  inserted: number;
  done: boolean;
  lastSyncedAt: string | null;
  error?: string;
}

export const COST_SCALE = 1_000_000_000;

export interface PriceModel {
  id: string;
  name?: string;
  tier?: string | null;
  input?: number;
  output?: number;
  cachedRead?: number;
  cachedWrite?: number | null;
  usage: number;
  pattern?: { input: number; cachedRead: number; output: number };
  contextWindow?: number;
  provider?: string;
}

export interface PriceSnapshotData {
  fetchedAt: string;
  snapshotDate: string;
  monthlyCredit: number;
  monthlyCost: number;
  peakHours: Record<string, [number, number][]> | null;
  models: PriceModel[];
  freeModels: { id: string }[] | null;
}

export interface EstimateRequestRow {
  model: string;
  tier: string | null;
  requestsMo: number;
  rate7PerDay: number;
}

export interface EstimateResult {
  windowStart: string;
  windowLengthMs: number;
  recordCount: number;
  officialMonthlyPct: number | null;
  officialResetInSec: number | null;
  rows: EstimateRequestRow[];
  ref: EstimateRequestRow | null;
}
