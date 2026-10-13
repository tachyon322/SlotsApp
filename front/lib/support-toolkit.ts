"use client";

import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import {
  meApi,
  walletApi,
  bonusApi,
  wheelApi,
  api,
  type WalletHistoryItem,
  type WalletPaymentItem,
} from "@/lib/api";
import { getGameInfo } from "@/lib/app-knowledge";

type TransactionsResponse = Awaited<ReturnType<typeof walletApi.transactions>>;

// Backend statuses of a transaction row. "cancelled" / "refund_pending" are real
// DB values for withdrawals even though the response type only lists three.
const STATUS_LABELS: Record<string, string> = {
  pending: "в обработке",
  success: "выполнено",
  failed: "отклонено",
  cancelled: "отменено, средства возвращены на баланс",
  refund_pending: "отклонено, возврат средств в процессе",
};

const WITHDRAW_REJECT_REASONS: Record<string, string> = {
  need_deposit: "нет ни одного успешного депозита",
  need_verification: "не пройдена верификация реквизитов",
  verification_pending: "верификация реквизитов ещё проверяется",
  need_premium: "нет активной Премиум подписки",
};

const MSK_TIME_ZONE = "Europe/Moscow";

/**
 * Время в формате, понятном модели: дата/время по Москве + сколько прошло.
 * Инструменты отдают ISO-в-UTC, который модель регулярно читает как «сегодня»,
 * поэтому каждую дату переводим в МСК и добавляем возраст записи.
 */
function stamp(iso?: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const at = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", "");

  const minutes = Math.round(Math.abs(now.getTime() - date.getTime()) / 60_000);
  const suffix =
    minutes < 1
      ? "только что"
      : minutes < 60
        ? `${minutes} мин назад`
        : minutes < 60 * 24
          ? `${Math.round(minutes / 60)} ч назад`
          : `${Math.round(minutes / (60 * 24))} дн. назад`;

  return `${at} МСК (${suffix})`;
}

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  NEW: "платёж создан, оплата ещё не подтверждена",
  PENDING: "ожидает оплаты или подтверждения провайдера",
  AWAITING_RECEIPT: "оплата подтверждена провайдером, деньги ещё не зачислены на баланс",
  CONFIRMED_BY_USER: "оплата подтверждена, ожидает зачисления",
  PAID: "оплачено и зачислено на баланс",
  FAILED: "платёж не состоялся",
  CANCELED: "платёж отменён",
  EXPIRED: "срок оплаты истёк",
};

const PAYMENT_PURPOSE_TEXT: Record<string, string> = {
  deposit: "пополнение баланса",
  verification: "верификация реквизитов",
  premium: "Премиум подписка",
};

function paymentView(p: WalletPaymentItem, now: Date) {
  return {
    purpose: PAYMENT_PURPOSE_TEXT[p.purpose] ?? p.purpose,
    amount: p.amount,
    method: p.method,
    status: p.status,
    statusText: PAYMENT_STATUS_TEXT[p.status] ?? p.status,
    credited: p.credited,
    receiptAttached: p.hasReceipt,
    createdAt: stamp(p.createdAt, now),
    updatedAt: stamp(p.updatedAt, now),
  };
}

function historyView(item: WalletHistoryItem, now: Date) {
  return {
    id: item.id,
    type: item.type,
    category: item.category,
    title: item.title,
    subtitle: item.subtitle,
    amount: item.amount,
    status: item.status,
    statusText: STATUS_LABELS[item.status] ?? item.status,
    createdAt: stamp(item.createdAt, now),
    processingUntil: item.processingUntil ? stamp(item.processingUntil, now) : null,
  };
}

const summarizeTransactions = (res: TransactionsResponse, limit = 25, now: Date = new Date()) => ({
  counts: res.counts,
  items: res.items.slice(0, limit).map((i) => historyView(i, now)),
});

type HistoryRow = {
  bet?: unknown;
  multiplier?: unknown;
  payout?: unknown;
  outcome?: unknown;
  createdAt?: unknown;
};

const summarizeHistory = (res: { items: HistoryRow[] }, limit = 20) =>
  res.items.slice(0, limit).map((i) => ({
    bet: i.bet,
    multiplier: i.multiplier,
    payout: i.payout,
    outcome: i.outcome,
    createdAt: i.createdAt,
  }));

export const supportToolkit = defineToolkit({
  get_account_status: {
    type: "frontend",
    description:
      "ОБЯЗАТЕЛЬНО перед любым ответом о депозитах, пополнениях, выводе, верификации, Премиуме или балансе. Возвращает фактическое состояние счёта: баланс, был ли успешный депозит и когда именно, пройдена ли верификация, активна ли Премиум подписка, есть ли заявка на вывод, доступен ли вывод и последние платежи с их статусами (включая платежи, которые ещё не зачислены).",
    parameters: z.object({}),
    execute: async () => {
      try {
        const s = await walletApi.accountStatus();
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
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Проверяю счёт…", complete: "Данные счёта получены" },
  },
  get_payments: {
    type: "frontend",
    description:
      "Вызывать, когда пользователь говорит, что оплатил, а денег нет, или спрашивает про конкретный платёж. Возвращает платежи пользователя во ВСЕХ статусах, включая ещё не зачисленные (ожидает оплаты, ожидает подтверждения), с датами. Зачисленные суммы видны в операциях по счёту, поэтому этот инструмент — единственный способ отличить «не оплачивал» от «оплатил, платёж в обработке».",
    parameters: z.object({}),
    execute: async () => {
      try {
        const res = await walletApi.payments(10);
        const now = new Date();
        return { items: res.items.map((p) => paymentView(p, now)) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю платежи…", complete: "Платежи получены" },
  },
  get_user_info: {
    type: "frontend",
    description:
      "Получить информацию о текущем пользователе: имя, баланс, уровень, опыт.",
    parameters: z.object({}),
    execute: async () => {
      try {
        const { user } = await meApi.get();
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          balance: user.balance,
          level: user.level,
          xp: user.xp,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю профиль пользователя…", complete: "Профиль получен" },
  },
  get_transactions: {
    type: "frontend",
    description:
      "Финансовые операции пользователя. Без tab (или tab=all) возвращает счётчики и последние депозиты, выводы и бонусы отдельно — депозит виден всегда, даже если после него было много игровых раундов; всегда вызывай при вопросах про пополнения и зачисления. Для конкретной вкладки укажи tab: games, bonuses, wins, deposits, withdrawals, losses. Для вопросов про выводы лучше вызывать get_withdraw_status — он возвращает все заявки на вывод и их статусы.",
    parameters: z.object({
      tab: z
        .enum(["all", "games", "bonuses", "wins", "deposits", "withdrawals", "losses"])
        .optional()
        .describe("Фильтр транзакций, по умолчанию all — раздельно депозиты, выводы и бонусы"),
    }),
    execute: async ({ tab }) => {
      try {
        const now = new Date();
        if (tab && tab !== "all") {
          return summarizeTransactions(await walletApi.transactions(tab), 25, now);
        }
        const [deposits, withdrawals, bonuses] = await Promise.all([
          walletApi.transactions("deposits"),
          walletApi.transactions("withdrawals"),
          walletApi.transactions("bonuses"),
        ]);
        return {
          counts: deposits.counts,
          lastDeposits: deposits.items.slice(0, 5).map((i) => historyView(i, now)),
          lastWithdrawals: withdrawals.items.slice(0, 5).map((i) => historyView(i, now)),
          lastBonuses: bonuses.items.slice(0, 5).map((i) => historyView(i, now)),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю операции по счёту…", complete: "Операции получены" },
  },
  get_withdraw_status: {
    type: "frontend",
    description:
      "Получить всё про выводы средств пользователя: активную заявку в обработке, историю всех выводов (в обработке, выполненные, отклонённые, отменённые) с суммами и датами, отклонённые заявки с причиной и требования к выводу (депозит, верификация, Premium). Для общих вопросов о счёте используй get_account_status.",
    parameters: z.object({}),
    execute: async () => {
      try {
        // withdrawActive settles expired pending withdrawals on the server, so
        // it must finish before the history is read, otherwise statuses are stale.
        const { request: activeRaw } = await walletApi.withdrawActive();
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
          walletApi.eligibility(),
          walletApi.withdrawRequests(),
          walletApi.transactions("withdrawals"),
        ]);
        return {
          eligibility,
          activeRequest,
          rejectedRequests: requests.items.map(({ id, amount, code, createdAt, method, verificationFailed }) => ({
            id,
            amount,
            code,
            createdAt: stamp(createdAt, now),
            method,
            verificationFailed,
            reason: WITHDRAW_REJECT_REASONS[code] ?? code,
          })),
          history: summarizeTransactions(history, 30, now).items,
          totalWithdrawals: history.counts.withdrawals,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Проверяю статус вывода…", complete: "Статус вывода получен" },
  },
  get_game_history: {
    type: "frontend",
    description:
      "Получить историю игр пользователя. Допустимые значения game: crash, mines, slots, cases, blockblast, minedrop.",
    parameters: z.object({
      game: z
        .enum(["crash", "mines", "slots", "cases", "blockblast", "minedrop"])
        .describe("Название игры"),
    }),
    execute: async ({ game }) => {
      try {
        let items: HistoryRow[] = [];
        switch (game) {
          case "crash":
            items = (await api.crashHistory(20)).items;
            break;
          case "mines":
            items = (await api.minesHistory(20)).items;
            break;
          case "slots":
            items = (await api.slotsHistory(20)).items;
            break;
          case "cases":
            items = (await api.casesHistory(20)).items;
            break;
          case "blockblast":
            items = (await api.blockblastHistory(20)).items;
            break;
          case "minedrop":
            items = (await api.minedropHistory(20)).items;
            break;
        }
        return { game, items: summarizeHistory({ items }) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю историю игры…", complete: "История игры получена" },
  },
  get_bonuses: {
    type: "frontend",
    description:
      "Получить статус бонусов пользователя: ежедневный бонус, приветственный, за установку, достижения и общий прогресс.",
    parameters: z.object({}),
    execute: async () => {
      try {
        return await bonusApi.status();
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю бонусы…", complete: "Бонусы получены" },
  },
  get_wheel_status: {
    type: "frontend",
    description: "Получить статус призового колеса: баланс, количество кручений.",
    parameters: z.object({}),
    execute: async () => {
      try {
        return await wheelApi.status();
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю статус колеса…", complete: "Статус колеса получен" },
  },
  get_game_info: {
    type: "frontend",
    description:
      "Получить подробное описание игры и её правил. Допустимые значения game: crash, mines, slots, cases, blockblast, minedrop.",
    parameters: z.object({
      game: z
        .enum(["crash", "mines", "slots", "cases", "blockblast", "minedrop"])
        .describe("Название игры"),
    }),
    execute: async ({ game }) => {
      const info = getGameInfo(game);
      if (!info) return { error: `Игра "${game}" не найдена` };
      return { game, name: info.name, rules: info.rules };
    },
    renderText: { running: "Читаю описание игры…", complete: "Описание игры получено" },
  },
});
