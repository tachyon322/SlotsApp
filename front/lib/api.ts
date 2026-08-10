const BASE = typeof window === 'undefined'
  ? process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''
  : '';

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

async function authedGet<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
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

async function authedPost<T = unknown>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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

async function authedPatch<T = unknown>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
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

async function authedDelete<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
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
  nextCursor: string | null;
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
  quick: (ref?: string) => post<QuickAuthResponse>("/api/quick-auth", { ref: ref || undefined }),
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
  transactions: (tab = 'all', cursor?: string) =>
    get<WalletTransactionsResponse>(
      `/api/wallet/transactions?tab=${encodeURIComponent(tab)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
};

export interface DevtoolsRedisStep {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export interface DevtoolsRedisCheckResponse {
  ok: boolean;
  steps: DevtoolsRedisStep[];
  totalMs: number;
  error: string | null;
  redisUrl: string;
}

export interface DevtoolsFunnelGates {
  hasDeposit: boolean;
  hasPaidVerification: boolean;
  verifiedForPayment: boolean;
  premiumActive: boolean;
  premiumUntil: string | null;
}

export interface DevtoolsFunnelStatusResponse {
  user: {
    id: string;
    name: string;
    email: string;
    balance: number;
  };
  gates: DevtoolsFunnelGates;
  withdrawals: {
    id: string;
    amount: number;
    status: string;
    method: string | null;
    details: string | null;
    createdAt: string;
  }[];
}

export interface DevtoolsDepositResponse {
  success: boolean;
  amount: number;
  bonusAmount: number;
  balance: number;
  paymentId: string;
}

export const devtoolsApi = {
  redisCheck: () => get<DevtoolsRedisCheckResponse>("/api/gjiweg32tji32/redis/check"),
  funnelStatus: () => get<DevtoolsFunnelStatusResponse>("/api/gjiweg32tji32/funnel/status"),
  funnelDeposit: (amount?: number) =>
    post<DevtoolsDepositResponse>("/api/gjiweg32tji32/funnel/deposit", { amount }),
  funnelVerify: () => post<{ success: boolean; paymentId: string }>("/api/gjiweg32tji32/funnel/verify"),
  funnelPremium: () => post<{ success: boolean; paymentId: string }>("/api/gjiweg32tji32/funnel/premium"),
  funnelSetVerifiedPayment: (verified: boolean) =>
    post<{ success: boolean; verifiedForPayment: boolean }>(
      "/api/gjiweg32tji32/funnel/verified-payment",
      { verified },
    ),
  funnelReset: () => post<{ success: boolean }>("/api/gjiweg32tji32/funnel/reset"),
};

export type AchievementStatus = 'claimed' | 'completed' | 'in_progress';

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  emoji: string;
  reward: number;
  metric: string;
  target: number;
  game?: string;
  progress: number;
  percent: number;
  status: AchievementStatus;
}

export interface BonusSummary {
  total: number;
  obtained: number;
  claimable: number;
  inProgress: number;
  earnedMoney: number;
}

export interface BonusesStatusResponse {
  level: {
    level: number;
    xp: number;
    xpToNext: number;
    progress: number;
    nextReward: number;
  };
  daily: {
    streak: number;
    claimedToday: boolean;
    amount: number;
    cycle: number[];
  };
  welcome: { amount: number; claimed: boolean };
  install: { amount: number; claimed: boolean };
  summary: BonusSummary;
  preview: Array<{ id: string; title: string; emoji: string; reward: number; progress: number; target: number }>;
}

export interface BonusClaimResponse {
  balance: number;
  reward: number;
  claimed: boolean;
  streak?: number;
  claimedToday?: boolean;
}

export interface AchievementsResponse {
  total: number;
  achievements: AchievementView[];
  summary: BonusSummary;
}

export interface ChallengesResponse {
  date: string;
  challenges: AchievementView[];
}

export const bonusApi = {
  status: () => get<BonusesStatusResponse>("/api/bonuses/status"),
  claimDaily: () => post<BonusClaimResponse>("/api/bonuses/daily/claim"),
  claimWelcome: () => post<BonusClaimResponse>("/api/bonuses/welcome/claim"),
  claimInstall: () => post<BonusClaimResponse>("/api/bonuses/install/claim"),
  achievements: () => get<AchievementsResponse>("/api/bonuses/achievements"),
  claimAchievement: (id: string) =>
    post<BonusClaimResponse>(`/api/bonuses/achievements/${encodeURIComponent(id)}/claim`),
  challenges: () => get<ChallengesResponse>("/api/bonuses/challenges"),
  claimChallenge: (id: string) =>
    post<BonusClaimResponse>(`/api/bonuses/challenges/${encodeURIComponent(id)}/claim`),
};

export interface AdminStatsResponse {
  users: {
    total: number;
    today: number;
  };
  deposits: {
    total: number;
    sum: number;
    today: number;
    todaySum: number;
  };
  support: {
    conversations: number;
  };
}

export interface AdminConfigResponse {
  welcomeBonus: number;
  minDeposit: number;
}

export interface PublicConfigResponse {
  minDeposit: number;
  welcomeBonus: number;
}

export const configApi = {
  get: () => get<PublicConfigResponse>("/api/config"),
  registrationBonus: (ref: string) =>
    get<{ bonus: number }>(`/api/affiliate/registration-bonus?ref=${encodeURIComponent(ref)}`),
};

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  balance: number;
  level: number;
  xp: number;
  createdAt: string;
}

export interface AdminUsersResponse {
  total: number;
  items: AdminUserItem[];
}

export interface AdminDepositItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  amount: number;
  method: string | null;
  details: string | null;
  createdAt: string;
}

export interface AdminDepositsResponse {
  total: number;
  sum: number;
  items: AdminDepositItem[];
}

export interface AdminUserUpdateData {
  name?: string;
  email?: string;
  balance?: number;
  level?: number;
  xp?: number;
}

export interface AdminUserUpdateResponse {
  user: AdminUserItem;
}

export interface AdminSupportConversation {
  id: string;
  userId: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  } | null;
}

export interface AdminSupportConversationsResponse {
  total: number;
  items: AdminSupportConversation[];
}

export interface AdminSupportMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AdminSupportConversationDetailResponse {
  conversation: {
    id: string;
    userId: string;
    name: string;
    email: string;
    createdAt: string;
    updatedAt: string;
  };
  items: AdminSupportMessageItem[];
}

export const adminApi = {
  stats: (token: string) => authedGet<AdminStatsResponse>("/api/admin/stats", token),
  users: (token: string, limit = 50, offset = 0) =>
    authedGet<AdminUsersResponse>(`/api/admin/users?limit=${limit}&offset=${offset}`, token),
  deposits: (token: string, limit = 50, offset = 0) =>
    authedGet<AdminDepositsResponse>(`/api/admin/deposits?limit=${limit}&offset=${offset}`, token),
  updateUser: (token: string, id: string, data: AdminUserUpdateData) =>
    authedPost<AdminUserUpdateResponse>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      token,
      data,
    ),
  getConfig: (token: string) => authedGet<AdminConfigResponse>("/api/admin/config", token),
  updateConfig: (token: string, data: { welcomeBonus?: number; minDeposit?: number }) =>
    authedPost<AdminConfigResponse>("/api/admin/config", token, data),
  supportConversations: (token: string, limit = 50, offset = 0) =>
    authedGet<AdminSupportConversationsResponse>(
      `/api/admin/support?limit=${limit}&offset=${offset}`,
      token,
    ),
  supportConversation: (token: string, id: string) =>
    authedGet<AdminSupportConversationDetailResponse>(
      `/api/admin/support/${encodeURIComponent(id)}`,
      token,
    ),
};

// ---------------------------------------------------------------- affiliate

export type AffiliateSourceType = 'link' | 'promo';

export interface AffiliateSource {
  id: string;
  code: string;
  name: string;
  type: AffiliateSourceType;
  registrationBonus: number | null;
  groupId: string | null;
  redirectId: string | null;
  domain: string | null;
  comment: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  groupName: string | null;
  redirectName: string | null;
}

export interface AffiliateSourceStats {
  clicks: number;
  uniqueClicks: number;
  signups: number;
  promos: number;
  depositors: number;
  depositsCount: number;
  depositsSum: number;
  income: number;
  crPayment: number | null;
  cr: number | null;
}

export type AffiliateSourceItem = AffiliateSource & AffiliateSourceStats;

export interface AffiliatePartner {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  isActive: boolean;
  balance: number;
  commissionPercent: number;
  comment: string | null;
  createdAt: string;
}

export interface AffiliateLoginResponse {
  token: string;
  partner: AffiliatePartner;
}

export interface AffiliateRegisterResponse {
  partner: AffiliatePartner;
}

export interface AffiliateMeResponse {
  partner: AffiliatePartner;
}

export type LeaderboardMetric = 'clicks' | 'signups' | 'deposits' | 'income';
export type LeaderboardPeriod = 'week' | 'month' | 'all';

export interface AffiliateLeaderboardEntry extends AffiliatePartner {
  clicks: number;
  signups: number;
  promos: number;
  depositors: number;
  depositsSum: number;
  income: number;
  cr: number | null;
}

export interface AffiliateLeaderboardResponse {
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  items: AffiliateLeaderboardEntry[];
}

export interface AffiliateReferral {
  userId: string;
  name: string;
  email: string | null;
  kind: 'registration' | 'promo';
  createdAt: string;
  sourceId: string;
  sourceName: string;
  depositsCount: number;
  depositsSum: number;
  income: number;
  commissionPercent: number;
}

export interface AffiliateReferralsResponse {
  total: number;
  sum: number;
  items: AffiliateReferral[];
}

export interface AffiliateTransaction {
  id: string;
  partnerId: string;
  type: 'commission';
  amount: number;
  refUserId: string | null;
  depositAmount: number | null;
  commissionPercent: number | null;
  createdAt: string;
}

export interface AffiliateGroup {
  id: string;
  name: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateDomain {
  id: string;
  url: string;
  isActive: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateRedirectUrl {
  id: string;
  redirectId: string;
  url: string;
  weight: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface AffiliateRedirect {
  id: string;
  name: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  urls: AffiliateRedirectUrl[];
}

export interface AffiliateDailyPoint {
  date: string;
  clicks: number;
  signups: number;
  promos: number;
  depositsSum: number;
  income: number;
}

export type AffiliateHistoryKind = 'click' | 'registration' | 'promo' | 'deposit';

export interface AffiliateHistoryItem {
  id: string;
  kind: AffiliateHistoryKind;
  sourceId: string;
  sourceName: string;
  amount: number | null;
  createdAt: string;
}

export interface AffiliateStatsResponse {
  summary: Record<'today' | 'week' | 'month' | 'all', AffiliateSourceStats>;
  daily: AffiliateDailyPoint[];
  topSources: AffiliateSourceItem[];
  history: AffiliateHistoryItem[];
}

export interface AffiliateSourcesResponse {
  total: number;
  items: AffiliateSourceItem[];
}

export interface AffiliateSourceInput {
  name?: string;
  type?: AffiliateSourceType;
  code?: string;
  registrationBonus?: number | null;
  groupId?: string | null;
  redirectId?: string | null;
  domain?: string | null;
  comment?: string | null;
  isActive?: boolean;
}

export interface AffiliateConfigResponse {
  domains: string[];
  defaultDomain: string;
}

export interface AffiliateAttribResponse {
  attributed: boolean;
}

export const partnerApi = {
  login: (email: string, password: string) =>
    post<AffiliateLoginResponse>('/api/affiliate/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    post<AffiliateRegisterResponse>('/api/affiliate/auth/register', { name, email, password }),
  me: (token: string) => authedGet<AffiliateMeResponse>('/api/affiliate/auth/me', token),
  leaderboard: (token: string, period?: LeaderboardPeriod, metric?: LeaderboardMetric) => {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (metric) params.set('metric', metric);
    const qs = params.toString();
    return authedGet<AffiliateLeaderboardResponse>(`/api/affiliate/leaderboard${qs ? `?${qs}` : ''}`, token);
  },
  referrals: (token: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return authedGet<AffiliateReferralsResponse>(`/api/affiliate/referrals${qs ? `?${qs}` : ''}`, token);
  },
  transactions: (token: string) =>
    authedGet<{ items: AffiliateTransaction[] }>('/api/affiliate/transactions', token),
  partners: (token: string) =>
    authedGet<{ items: AffiliatePartner[] }>('/api/affiliate/partners', token),
  createPartner: (token: string, data: { name?: string; email?: string; password?: string; isActive?: boolean; commissionPercent?: number; comment?: string }) =>
    authedPost<{ partner: AffiliatePartner; email: string; password: string }>('/api/affiliate/partners', token, data),
  updatePartner: (token: string, id: string, data: { name?: string; email?: string; password?: string; isActive?: boolean; commissionPercent?: number; comment?: string }) =>
    authedPatch<{ partner: AffiliatePartner }>(`/api/affiliate/partners/${encodeURIComponent(id)}`, token, data),
  deletePartner: (token: string, id: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/partners/${encodeURIComponent(id)}`, token),
  partnerReferrals: (token: string, partnerId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return authedGet<AffiliateReferralsResponse>(
      `/api/affiliate/partners/${encodeURIComponent(partnerId)}/referrals${qs ? `?${qs}` : ''}`,
      token,
    );
  },
  stats: (token: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return authedGet<AffiliateStatsResponse>(`/api/affiliate/stats${qs ? `?${qs}` : ''}`, token);
  },
  config: (token: string) => authedGet<AffiliateConfigResponse>('/api/affiliate/config', token),
  domains: (token: string) =>
    authedGet<{ items: AffiliateDomain[] }>('/api/affiliate/domains', token),
  createDomain: (token: string, data: { url?: string; isActive?: boolean; comment?: string }) =>
    authedPost<{ domain: AffiliateDomain }>('/api/affiliate/domains', token, data),
  updateDomain: (token: string, id: string, data: { url?: string; isActive?: boolean; comment?: string }) =>
    authedPatch<{ domain: AffiliateDomain }>(`/api/affiliate/domains/${encodeURIComponent(id)}`, token, data),
  deleteDomain: (token: string, id: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/domains/${encodeURIComponent(id)}`, token),
  sources: (token: string, opts: { limit?: number; offset?: number; search?: string; groupId?: string; type?: AffiliateSourceType; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.search) params.set('search', opts.search);
    if (opts.groupId) params.set('groupId', opts.groupId);
    if (opts.type) params.set('type', opts.type);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    const qs = params.toString();
    return authedGet<AffiliateSourcesResponse>(`/api/affiliate/sources${qs ? `?${qs}` : ''}`, token);
  },
  createSource: (token: string, data: AffiliateSourceInput) =>
    authedPost<{ source: AffiliateSource }>('/api/affiliate/sources', token, data),
  updateSource: (token: string, id: string, data: AffiliateSourceInput) =>
    authedPatch<{ source: AffiliateSource }>(`/api/affiliate/sources/${encodeURIComponent(id)}`, token, data),
  deleteSource: (token: string, id: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/sources/${encodeURIComponent(id)}`, token),
  groups: (token: string) =>
    authedGet<{ items: AffiliateGroup[] }>('/api/affiliate/groups', token),
  createGroup: (token: string, data: { name?: string; comment?: string }) =>
    authedPost<{ group: AffiliateGroup }>('/api/affiliate/groups', token, data),
  updateGroup: (token: string, id: string, data: { name?: string; comment?: string }) =>
    authedPatch<{ group: AffiliateGroup }>(`/api/affiliate/groups/${encodeURIComponent(id)}`, token, data),
  deleteGroup: (token: string, id: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/groups/${encodeURIComponent(id)}`, token),
  redirects: (token: string) =>
    authedGet<{ items: AffiliateRedirect[] }>('/api/affiliate/redirects', token),
  createRedirect: (token: string, data: { name?: string; comment?: string; urls?: string[] }) =>
    authedPost<{ redirect: AffiliateRedirect }>('/api/affiliate/redirects', token, data),
  updateRedirect: (token: string, id: string, data: { name?: string; comment?: string }) =>
    authedPatch<{ redirect: AffiliateRedirect }>(`/api/affiliate/redirects/${encodeURIComponent(id)}`, token, data),
  deleteRedirect: (token: string, id: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/redirects/${encodeURIComponent(id)}`, token),
  addRedirectUrl: (token: string, redirectId: string, data: { url?: string; weight?: number }) =>
    authedPost<{ url: AffiliateRedirectUrl }>(`/api/affiliate/redirects/${encodeURIComponent(redirectId)}/urls`, token, data),
  updateRedirectUrl: (token: string, redirectId: string, urlId: string, data: { url?: string; weight?: number; isActive?: boolean }) =>
    authedPatch<{ url: AffiliateRedirectUrl }>(`/api/affiliate/redirects/${encodeURIComponent(redirectId)}/urls/${encodeURIComponent(urlId)}`, token, data),
  deleteRedirectUrl: (token: string, redirectId: string, urlId: string) =>
    authedDelete<{ success: boolean }>(`/api/affiliate/redirects/${encodeURIComponent(redirectId)}/urls/${encodeURIComponent(urlId)}`, token),
  attrib: (ref: string) => post<AffiliateAttribResponse>('/api/affiliate/attrib', { ref }),
};

export function buildAffiliateLink(
  code: string,
  domain?: string | null,
  defaultDomain?: string,
): string {
  const origin = domain || defaultDomain || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/r/${encodeURIComponent(code)}`;
}
