/**
 * Серверное исполнение инструментов ИИ-поддержки.
 *
 * Инструменты опрашивают счёт, платежи, выводы — то есть обычные GET-запросы к
 * бэкенду с кукой пользователя. Раньше их исполнял браузер: если пользователь
 * уходил со страницы (или телефон усыплял вкладку), цепочка рвалась, ответа не
 * существовало вовсе — в диалоге оставалась пустота. Поэтому те же инструменты
 * исполняет и сервер: ход завершается и ответ сохраняется независимо от браузера.
 *
 * Схемы и описания инструментов по-прежнему приходят от клиента (тулкит в
 * `support-toolkit.ts`), здесь — только исполнение.
 */
import { jsonSchema, type ToolSet } from "ai";
import type { JSONSchema7 } from "ai";
import {
  api,
  bonusApi,
  meApi,
  walletApi,
  wheelApi,
} from "@/lib/api";
import { getGameInfo } from "@/lib/app-knowledge";
import {
  historyView,
  paymentView,
  stamp,
  summarizeHistory,
  summarizeTransactions,
  WITHDRAW_REJECT_REASONS,
  type HistoryRow,
} from "@/lib/support-view";

export type ClientToolSchema = { description?: string; parameters: JSONSchema7 };

type ServerTool = {
  execute: (input: unknown, cookie: string) => Promise<unknown>;
};

async function withError<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const GAME_HISTORY: Record<string, (limit: number, cookie: string) => Promise<{ items: HistoryRow[] }>> = {
  crash: (limit, cookie) => api.crashHistory(limit, cookie),
  mines: (limit, cookie) => api.minesHistory(limit, cookie),
  slots: (limit, cookie) => api.slotsHistory(limit, cookie),
  cases: (limit, cookie) => api.casesHistory(limit, cookie),
  blockblast: (limit, cookie) => api.blockblastHistory(limit, cookie),
  minedrop: (limit, cookie) => api.minedropHistory(limit, cookie),
};

const SERVER_TOOLS: Record<string, ServerTool> = {
  get_account_status: {
    execute: (_input, cookie) =>
      withError(async () => {
        const s = await walletApi.accountStatus(cookie);
        const now = new Date(s.now);
        return {
          checkedAt: stamp(s.now, now),
          balance: s.balance,
          level: s.level,
          hasDeposit: s.hasDeposit,
          lastDeposit: s.lastDeposit
            ? {
                amount: s.lastDeposit.amount,
                method: s.lastDeposit.method,
                at: stamp(s.lastDeposit.createdAt, now),
              }
            : null,
          depositsTotal: s.depositsTotal,
          verificationPassed: s.verifiedForPayment,
          premiumActive: s.premiumActive,
          premiumUntil: s.premiumUntil ? stamp(s.premiumUntil, now) : null,
          withdrawalAvailable: s.withdrawal.available,
          withdrawalRequirements: {
            deposit: s.withdrawal.requirements.deposit ? "пройден" : "не пройден",
            verification: s.withdrawal.requirements.verification ? "пройдена" : "не пройдена",
            premium: s.withdrawal.requirements.premium ? "активна" : "не активна",
          },
          pendingWithdrawal: s.withdrawal.pendingRequest
            ? {
                amount: s.withdrawal.pendingRequest.amount,
                method: s.withdrawal.pendingRequest.method,
                createdAt: stamp(s.withdrawal.pendingRequest.createdAt, now),
                processingUntil: stamp(s.withdrawal.pendingRequest.processingUntil, now),
              }
            : null,
          refund: {
            eligible: s.refund.eligible,
            available: s.refund.available,
            pendingRequest: s.refund.pendingRequest
              ? {
                  amount: s.refund.pendingRequest.amount,
                  createdAt: stamp(s.refund.pendingRequest.createdAt, now),
                }
              : null,
          },
          lastPayments: s.lastPayments.map((p) => paymentView(p, now)),
        };
      }),
  },
  get_payments: {
    execute: (_input, cookie) =>
      withError(async () => {
        const res = await walletApi.payments(10, cookie);
        const now = new Date();
        return { items: res.items.map((p) => paymentView(p, now)) };
      }),
  },
  get_user_info: {
    execute: (_input, cookie) =>
      withError(async () => {
        const { user } = await meApi.get(cookie);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          balance: user.balance,
          level: user.level,
          xp: user.xp,
        };
      }),
  },
  get_transactions: {
    execute: (input, cookie) =>
      withError(async () => {
        const tab = (input as { tab?: string } | null)?.tab;
        const now = new Date();
        if (tab && tab !== "all") {
          return summarizeTransactions(await walletApi.transactions(tab, undefined, cookie), 25, now);
        }
        const [deposits, withdrawals, bonuses] = await Promise.all([
          walletApi.transactions("deposits", undefined, cookie),
          walletApi.transactions("withdrawals", undefined, cookie),
          walletApi.transactions("bonuses", undefined, cookie),
        ]);
        return {
          counts: deposits.counts,
          lastDeposits: deposits.items.slice(0, 5).map((i) => historyView(i, now)),
          lastWithdrawals: withdrawals.items.slice(0, 5).map((i) => historyView(i, now)),
          lastBonuses: bonuses.items.slice(0, 5).map((i) => historyView(i, now)),
        };
      }),
  },
  get_withdraw_status: {
    execute: (_input, cookie) =>
      withError(async () => {
        // withdrawActive settles expired pending withdrawals on the server, so
        // it must finish before the history is read, otherwise statuses are stale.
        const { request: activeRaw } = await walletApi.withdrawActive(cookie);
        // Requisites (card / phone) are deliberately not passed to the model.
        const now = new Date();
        const activeRequest = activeRaw
          ? {
              id: activeRaw.id,
              amount: activeRaw.amount,
              method: activeRaw.method,
              createdAt: stamp(activeRaw.createdAt, now),
              processingUntil: stamp(activeRaw.processingUntil, now),
            }
          : null;
        const [eligibility, requests, history] = await Promise.all([
          walletApi.eligibility(cookie),
          walletApi.withdrawRequests(cookie),
          walletApi.transactions("withdrawals", undefined, cookie),
        ]);
        return {
          eligibility,
          activeRequest,
          rejectedRequests: requests.items.map(
            ({ id, amount, code, createdAt, method, verificationFailed }) => ({
              id,
              amount,
              code,
              createdAt: stamp(createdAt, now),
              method,
              verificationFailed,
              reason: WITHDRAW_REJECT_REASONS[code] ?? code,
            }),
          ),
          history: summarizeTransactions(history, 30, now).items,
          totalWithdrawals: history.counts.withdrawals,
        };
      }),
  },
  get_game_history: {
    execute: (input, cookie) =>
      withError(async () => {
        const game = (input as { game?: string } | null)?.game ?? "";
        const fetchHistory = GAME_HISTORY[game];
        if (!fetchHistory) return { error: `Игра "${game}" не найдена` };
        const res = await fetchHistory(20, cookie);
        return { game, items: summarizeHistory({ items: res.items }) };
      }),
  },
  get_bonuses: {
    execute: (_input, cookie) => withError(() => bonusApi.status(cookie)),
  },
  get_wheel_status: {
    execute: (_input, cookie) => withError(() => wheelApi.status(cookie)),
  },
  get_game_info: {
    // Справочник, сети не требует — исполняем на сервере наравне с остальными.
    execute: (input) => {
      const game = (input as { game?: string } | null)?.game ?? "";
      const info = getGameInfo(game as Parameters<typeof getGameInfo>[0]);
      if (!info) return Promise.resolve({ error: `Игра "${game}" не найдена` });
      return Promise.resolve({ game, name: info.name, rules: info.rules });
    },
  },
};

/** Имена инструментов, которые сервер умеет исполнить сам. */
export function hasServerTool(name: string): boolean {
  return name in SERVER_TOOLS;
}

/**
 * Собирает набор инструментов для streamText: схемы и описания — от клиента
 * (чтобы модель видела ровно те же инструменты), исполнение — серверное. Для
 * неизвестных имён инструмент остаётся без execute — его исполнит браузер.
 */
export function buildSupportTools(
  tools: Record<string, ClientToolSchema> | undefined,
  cookie: string,
): ToolSet {
  const result: ToolSet = {};

  for (const [name, def] of Object.entries(tools ?? {})) {
    const server = SERVER_TOOLS[name];
    result[name] = {
      description: def.description,
      inputSchema: jsonSchema(def.parameters ?? { type: "object", properties: {} }),
      ...(server ? { execute: (input: unknown) => server.execute(input, cookie) } : {}),
    } as ToolSet[string];
  }

  return result;
}
