const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new ApiError((data as { message?: string }).message || "Ошибка запроса", res.status);
  }
  return data;
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new ApiError((data as { message?: string }).message || "Ошибка запроса", res.status);
  }
  return data;
}

export interface CrashBetResponse {
  balance: number;
  roundId: string;
}
export interface CrashCashoutResponse {
  balance: number;
  payout: number;
  multiplier: number;
}
export interface CrashBalanceResponse {
  balance: number;
}
export interface CrashHistoryItem {
  id: string;
  bet: number;
  crashPoint: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  createdAt: string;
}
export interface CrashHistoryResponse {
  items: CrashHistoryItem[];
}

export interface MinesBetResponse {
  balance: number;
}
export interface MinesCashoutResponse {
  balance: number;
  payout: number;
  multiplier: number;
}
export interface MinesLoseResponse {
  balance: number;
}
export interface MinesHistoryItem {
  id: string;
  bet: number;
  mines: number;
  opened: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  createdAt: string;
}
export interface MinesHistoryResponse {
  items: MinesHistoryItem[];
}

export interface SlotsWinLineInfo {
  lineId: number;
  symbol: string;
  count: number;
  payout: number;
  coords: Array<[number, number]>;
}

export interface SlotsSpinResponse {
  balance: number;
  grid: string[][];
  winLines: SlotsWinLineInfo[];
  totalPayout: number;
  multiplier: number;
  outcome: 'win' | 'loss' | 'ldw';
  totalBet: number;
}

export interface SlotsHistoryItem {
  id: string;
  bet: number;
  mode: 'classic' | 'mega';
  lines: number;
  lineBet: number;
  symbols: string;
  winLines: string;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss' | 'ldw';
  createdAt: string;
}

export interface SlotsHistoryResponse {
  items: SlotsHistoryItem[];
  stats: {
    totalWinnings: number;
    maxWin: number;
    totalCount: number;
  };
}

export const api = {
  crashBet: (amount: number, roundId: string) =>
    post<CrashBetResponse>("/api/crash/bet", { amount, roundId }),
  crashCashout: (multiplier: number, crashPoint: number) =>
    post<CrashCashoutResponse>("/api/crash/cashout", { multiplier, crashPoint }),
  crashCancel: () => post<CrashBalanceResponse>("/api/crash/cancel"),
  crashLose: (crashPoint: number) => post<CrashBalanceResponse>("/api/crash/lose", { crashPoint }),
  crashHistory: (limit = 30) => get<CrashHistoryResponse>(`/api/crash/history?limit=${limit}`),
  minesBet: (amount: number, mines: number) =>
    post<MinesBetResponse>("/api/mines/bet", { amount, mines }),
  minesCashout: (multiplier: number, opened: number) =>
    post<MinesCashoutResponse>("/api/mines/cashout", { multiplier, opened }),
  minesLose: (opened: number) => post<MinesLoseResponse>("/api/mines/lose", { opened }),
  minesHistory: (limit = 30) => get<MinesHistoryResponse>(`/api/mines/history?limit=${limit}`),
  slotsSpin: (mode: 'classic' | 'mega', lines: number, lineBet: number) =>
    post<SlotsSpinResponse>("/api/slots/spin", { mode, lines, lineBet }),
  slotsHistory: (limit = 30) => get<SlotsHistoryResponse>(`/api/slots/history?limit=${limit}`),
};