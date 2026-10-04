"use client";

import { defineToolkit } from "@assistant-ui/react";
import { z } from "zod";
import { meApi, walletApi, bonusApi, wheelApi, api } from "@/lib/api";
import { getGameInfo } from "@/lib/app-knowledge";

const summarizeTransactions = (
  res: Awaited<ReturnType<typeof walletApi.transactions>>,
  limit = 25,
) => ({
  counts: res.counts,
  items: res.items.slice(0, limit).map((t) => ({
    id: t.id,
    type: t.type,
    category: t.category,
    title: t.title,
    subtitle: t.subtitle,
    amount: t.amount,
    status: t.status,
    createdAt: t.createdAt,
  })),
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
      "Получить финансовые транзакции пользователя: депозиты, выводы, бонусы, выигрыши и проигрыши. Допустимые значения tab: all, games, bonuses, wins, deposits, withdrawals, losses.",
    parameters: z.object({
      tab: z
        .enum(["all", "games", "bonuses", "wins", "deposits", "withdrawals", "losses"])
        .optional()
        .describe("Фильтр транзакций, по умолчанию all"),
    }),
    execute: async ({ tab }) => {
      try {
        const res = await walletApi.transactions(tab);
        return summarizeTransactions(res);
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    renderText: { running: "Читаю транзакции…", complete: "Транзакции получены" },
  },
  get_withdraw_status: {
    type: "frontend",
    description:
      "Получить статус вывода средств: доступность вывода, требования (депозит, верификация, premium) и текущие заявки на вывод.",
    parameters: z.object({}),
    execute: async () => {
      try {
        const [eligibility, requests] = await Promise.all([
          walletApi.eligibility(),
          walletApi.withdrawRequests(),
        ]);
        return { eligibility, requests: requests.items };
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
