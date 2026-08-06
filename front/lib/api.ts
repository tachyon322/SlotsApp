const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
  };
  if (!res.ok) {
    throw new ApiError(
      (data as { message?: string }).message || "Ошибка запроса",
      res.status,
      (data as { code?: string }).code,
    );
  }
  return data;
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
  };
  if (!res.ok) {
    throw new ApiError(
      (data as { message?: string }).message || "Ошибка запроса",
      res.status,
      (data as { code?: string }).code,
    );
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

export interface CaseCardData {
  rarity: 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';
  rarityLabel: string;
  multiplier: number;
  prize: number;
}

export interface CaseLineResult {
  lineIndex: number;
  winnerIndex: number;
  winningCard: CaseCardData;
  strip: CaseCardData[];
  linePayout: number;
  lineMultiplier: number;
  rarity: 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';
}

export interface CasesSpinResponse {
  balance: number;
  totalBet: number;
  totalPayout: number;
  multiplier: number;
  outcome: 'win' | 'loss' | 'neutral';
  rarity: 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';
  caseId: string;
  linesCount: number;
  lineBet: number;
  winnerIndex: number;
  lines: CaseLineResult[];
}

export interface CasesHistoryItem {
  id: string;
  bet: number;
  caseId: string;
  lines: number;
  lineBet: number;
  rarity: 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss' | 'neutral';
  details: string;
  createdAt: string;
}

export interface CasesHistoryResponse {
  items: CasesHistoryItem[];
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
  casesSpin: (caseId: string, lines: number) =>
    post<CasesSpinResponse>("/api/cases/spin", { caseId, lines }),
  casesHistory: (limit = 30) => get<CasesHistoryResponse>(`/api/cases/history?limit=${limit}`),
  blockblastBet: (amount: number) =>
    post<BlockblastBetResponse>("/api/blockblast/bet", { amount }),
  blockblastLine: (lines: number) =>
    post<BlockblastLineResponse>("/api/blockblast/line", { lines }),
  blockblastCashout: (multiplier: number, placements: number) =>
    post<BlockblastCashoutResponse>("/api/blockblast/cashout", { multiplier, placements }),
  blockblastEnd: (placements: number) =>
    post<BlockblastEndResponse>("/api/blockblast/end", { placements }),
  blockblastHistory: (limit = 30) =>
    get<BlockblastHistoryResponse>(`/api/blockblast/history?limit=${limit}`),
  minedropBet: (amount: number) =>
    post<MinedropBetResponse>("/api/minedrop/bet", { amount }),
  minedropFinish: (multiplier: number, details: string) =>
    post<MinedropFinishResponse>("/api/minedrop/finish", { multiplier, details }),
  minedropHistory: (limit = 30) =>
    get<MinedropHistoryResponse>(`/api/minedrop/history?limit=${limit}`),
};

export interface BlockblastBetResponse {
  balance: number;
}
export interface BlockblastLineResponse {
  balance: number;
  added: number;
}
export interface BlockblastCashoutResponse {
  balance: number;
  payout: number;
  multiplier: number;
}
export interface BlockblastEndResponse {
  balance: number;
  payout: number;
  multiplier: number;
}
export interface BlockblastHistoryItem {
  id: string;
  bet: number;
  placements: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  createdAt: string;
}
export interface BlockblastHistoryResponse {
  items: BlockblastHistoryItem[];
}

export interface MinedropBetResponse {
  balance: number;
}
export interface MinedropFinishResponse {
  balance: number;
  payout: number;
  multiplier: number;
}
export interface MinedropHistoryItem {
  id: string;
  bet: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  details: string;
  createdAt: string;
}
export interface MinedropHistoryResponse {
  items: MinedropHistoryItem[];
}

export interface WalletWithdrawResponse {
  success: boolean;
  balance: number;
  amount: number;
}

export interface WalletPromoResponse {
  success: boolean;
  balance: number;
  rewardAmount: number;
  message: string;
}

export interface WalletHistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bonus' | 'win' | 'loss';
  category: 'games' | 'bonuses' | 'deposits' | 'withdrawals';
  title: string;
  subtitle: string;
  amount: number;
  status: 'success' | 'pending' | 'failed';
  createdAt: string;
}

export interface WalletTransactionsResponse {
  items: WalletHistoryItem[];
  counts: {
    all: number;
    games: number;
    bonuses: number;
    wins: number;
    deposits: number;
    withdrawals: number;
    losses: number;
  };
}

export interface WheelStatusResponse {
  balance: number;
  spinsLeft: number;
  dailySpins: number;
}

export interface WheelSpinResponse {
  balance: number;
  prize: number;
  spinsLeft: number;
  sectorIndex: number;
}

export interface PaymentCreateResponse {
  paymentId: string;
  link: string;
}

export interface PaymentStatusResponse {
  paymentId: string;
  amount: number;
  status: 'NEW' | 'PENDING' | 'CONFIRMED_BY_USER' | 'EXPIRED' | 'CANCELED' | 'FAILED' | 'PAID';
}

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    balance: number;
    level: number;
    xp: number;
    image?: string | null;
  };
}

export interface WithdrawEligibilityResponse {
  hasDeposit: boolean;
  hasPaidVerification: boolean;
  verifiedForPayment: boolean;
  premiumActive: boolean;
  premiumUntil: string | null;
}

export type WithdrawRequestCode = 'need_deposit' | 'need_verification' | 'need_premium' | 'verification_pending';

export interface WithdrawRequestItem {
  id: string;
  amount: number;
  code: WithdrawRequestCode;
  createdAt: string;
}

export interface WithdrawRequestsResponse {
  items: WithdrawRequestItem[];
}

export type PaymentPurpose = 'deposit' | 'verification' | 'premium';

export const wheelApi = {
  status: () => get<WheelStatusResponse>("/api/wheel/status"),
  spin: () => post<WheelSpinResponse>("/api/wheel/spin"),
};

export const meApi = {
  get: () => get<MeResponse>("/api/me"),
};

export interface QuickAuthResponse {
  login: string;
  password: string;
  balance: number;
}

export const authApi = {
  quick: () => post<QuickAuthResponse>("/api/quick-auth"),
};

export const paymentApi = {
  create: (amount: number, method: 'card' | 'sbp', purpose: PaymentPurpose = 'deposit') =>
    post<PaymentCreateResponse>("/api/wallet/payment", { amount, method, purpose }),
  status: (paymentId: string) =>
    get<PaymentStatusResponse>(`/api/wallet/payment/status?id=${encodeURIComponent(paymentId)}`),
};

export const walletApi = {
  withdraw: (amount: number, method: 'card' | 'sbp', requisites?: string) =>
    post<WalletWithdrawResponse>("/api/wallet/withdraw", { amount, method, requisites }),
  eligibility: () => get<WithdrawEligibilityResponse>("/api/wallet/withdraw/eligibility"),
  withdrawRequests: () => get<WithdrawRequestsResponse>("/api/wallet/withdraw/requests"),
  cancelWithdrawRequest: (id: string) =>
    post<{ success: boolean }>(`/api/wallet/withdraw/requests/${encodeURIComponent(id)}/cancel`),
  activatePromo: (code: string) =>
    post<WalletPromoResponse>("/api/wallet/promo", { code }),
  transactions: (tab = 'all') =>
    get<WalletTransactionsResponse>(`/api/wallet/transactions?tab=${encodeURIComponent(tab)}`),
};