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

export const api = {
  crashBet: (amount: number, roundId: string) =>
    post<CrashBetResponse>("/api/crash/bet", { amount, roundId }),
  crashCashout: (multiplier: number) =>
    post<CrashCashoutResponse>("/api/crash/cashout", { multiplier }),
  crashCancel: () => post<CrashBalanceResponse>("/api/crash/cancel"),
  crashLose: () => post<CrashBalanceResponse>("/api/crash/lose"),
};