import { describe, it, expect } from "bun:test";
import { computeAccessState, isLockExemptPath } from "./siteAccess";
import { WITHDRAWAL_PROCESSING_DAYS } from "./withdrawals";

const DAY = 24 * 60 * 60 * 1000;
const CREATED_AT = new Date("2026-10-01T12:00:00.000Z");
const DEADLINE = new Date(CREATED_AT.getTime() + WITHDRAWAL_PROCESSING_DAYS * DAY);

function at(offsetMs: number, overrideId: string | null = null) {
  return computeAccessState({
    requestId: "request-1",
    createdAt: CREATED_AT,
    now: new Date(DEADLINE.getTime() + offsetMs),
    overrideId,
  });
}

describe("computeAccessState", () => {
  it("заявка в срок — сайт открыт, клиенту отдан дедлайн", () => {
    const state = at(-1);
    expect(state.locked).toBe(false);
    expect(state.lockedUntil).toBe(DEADLINE.toISOString());
    expect(state.requestId).toBe("request-1");
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

  it("ручная разблокировка снимает блок для этой заявки и не даёт таймеру сработать", () => {
    const state = at(DAY, "request-1");
    expect(state.locked).toBe(false);
    expect(state.lockedUntil).toBeNull();
    expect(state.requestId).toBe("request-1");
    expect(state.reason).toBe("withdrawal_expired");
  });

  it("разблокировка чужой заявки не действует", () => {
    expect(at(DAY, "request-2").locked).toBe(true);
  });
});

describe("isLockExemptPath", () => {
  it("пропускает служебные пути", () => {
    for (const path of [
      "/api/me",
      "/api/access",
      "/api/auth/sign-in/email",
      "/api/quick-auth/session",
      "/api/admin/users",
      "/api/gjiweg32tji32/redis/check",
      "/api/wallet/account-status",
    ]) {
      expect(isLockExemptPath(path)).toBe(true);
    }
  });

  it("не пропускает игровые и денежные пути", () => {
    for (const path of ["/api/slots/spin", "/api/wallet/withdraw", "/api/bonuses", "/api/member"]) {
      expect(isLockExemptPath(path)).toBe(false);
    }
  });
});
