import { describe, it, expect } from "bun:test";
import {
  computeAccessState,
  isEffectivelyLocked,
  isLockExemptPath,
  shouldAutoLock,
} from "./siteAccess";
import { WITHDRAWAL_PROCESSING_DAYS } from "./withdrawals";

const DAY = 24 * 60 * 60 * 1000;
const CREATED_AT = new Date("2026-10-01T12:00:00.000Z");
const DEADLINE = new Date(CREATED_AT.getTime() + WITHDRAWAL_PROCESSING_DAYS * DAY);

function at(offsetMs: number) {
  return computeAccessState({
    createdAt: CREATED_AT,
    now: new Date(DEADLINE.getTime() + offsetMs),
  });
}

describe("computeAccessState", () => {
  it("заявка в срок — сайт открыт, клиенту отдан дедлайн", () => {
    const state = at(-1);
    expect(state.locked).toBe(false);
    expect(state.lockedUntil).toBe(DEADLINE.toISOString());
    expect(state.reason).toBeNull();
  });

  it("блокирует ровно в момент дедлайна", () => {
    const state = at(0);
    expect(state.locked).toBe(true);
    expect(state.reason).toBe("withdrawal_expired");
    expect(state.lockedUntil).toBe(DEADLINE.toISOString());
  });

  it("блокирует и после дедлайна", () => {
    expect(at(5 * DAY).locked).toBe(true);
  });
});

describe("isEffectivelyLocked", () => {
  it("устаревший кэш с прошедшим дедлайном считается блокировкой", () => {
    expect(isEffectivelyLocked(at(-1))).toBe(true);
  });

  it("дедлайн в будущем не блокирует", () => {
    expect(isEffectivelyLocked(at(-1), new Date(DEADLINE.getTime() - 1000))).toBe(false);
  });

  it("пустое состояние не блокирует", () => {
    expect(isEffectivelyLocked({ locked: false, lockedUntil: null, reason: null })).toBe(false);
  });
});

describe("shouldAutoLock", () => {
  const pending = { id: "withdrawal-1", createdAt: CREATED_AT };
  const afterDeadline = new Date(DEADLINE.getTime() + 1000);
  const beforeDeadline = new Date(DEADLINE.getTime() - 1000);

  it("ставит латч после дедлайна", () => {
    expect(
      shouldAutoLock({ enabled: true, pending, record: null, now: afterDeadline }),
    ).toBe(true);
  });

  it("не ставит до дедлайна", () => {
    expect(
      shouldAutoLock({ enabled: true, pending, record: null, now: beforeDeadline }),
    ).toBe(false);
  });

  it("выключенная фича не блокирует новых", () => {
    expect(
      shouldAutoLock({ enabled: false, pending, record: null, now: afterDeadline }),
    ).toBe(false);
  });

  it("уже locked не перезаписывается", () => {
    expect(
      shouldAutoLock({
        enabled: true,
        pending,
        record: { status: "locked", withdrawalId: pending.id },
        now: afterDeadline,
      }),
    ).toBe(false);
  });

  it("ручной unlock по той же заявке уважается", () => {
    expect(
      shouldAutoLock({
        enabled: true,
        pending,
        record: { status: "unlocked", withdrawalId: pending.id },
        now: afterDeadline,
      }),
    ).toBe(false);
  });

  it("новая заявка после unlock снова блокируется", () => {
    expect(
      shouldAutoLock({
        enabled: true,
        pending,
        record: { status: "unlocked", withdrawalId: "old-withdrawal" },
        now: afterDeadline,
      }),
    ).toBe(true);
  });

  it("без заявки не блокирует", () => {
    expect(
      shouldAutoLock({ enabled: true, pending: null, record: null, now: afterDeadline }),
    ).toBe(false);
  });
});

describe("isLockExemptPath", () => {
  it("пропускает только служебные пути", () => {
    for (const path of [
      "/api/me",
      "/api/access",
      "/api/admin/users",
      "/api/gjiweg32tji32/redis/check",
    ]) {
      expect(isLockExemptPath(path)).toBe(true);
    }
  });

  it("не пропускает остальное", () => {
    for (const path of [
      "/api/slots/spin",
      "/api/wallet/withdraw",
      "/api/bonuses",
      "/api/quick-auth/session",
      "/api/wallet/account-status",
      "/api/member",
    ]) {
      expect(isLockExemptPath(path)).toBe(false);
    }
  });
});
