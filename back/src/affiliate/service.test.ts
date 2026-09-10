import { describe, it, expect, spyOn } from "bun:test";
import { affiliateService } from "./service";
import * as cashxSync from "../cashx/sync";
import * as cashxClient from "../cashx/client";

describe("affiliateService.creditDepositCommission", () => {
  it("throws if paymentId is empty or missing", async () => {
    const occurredAt = new Date("2026-09-08T12:00:00Z");
    await expect(
      affiliateService.creditDepositCommission("user-1", 100, "", occurredAt, "deposit"),
    ).rejects.toThrow("paymentId is required for creditDepositCommission");
  });

  it("returns 0 and does not sync if deposit amount <= 0", async () => {
    const spy = spyOn(cashxSync, "syncCommission");
    const occurredAt = new Date("2026-09-08T12:00:00Z");
    const res = await affiliateService.creditDepositCommission("user-1", 0, "pay-1", occurredAt, "deposit");
    expect(res).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("calls cashxSync.syncCommission with canonical arguments and kind", async () => {
    const occurredAt = new Date("2026-09-08T15:30:00Z");
    const spy = spyOn(cashxSync, "syncCommission").mockResolvedValue({ status: "accepted" });

    const res = await affiliateService.creditDepositCommission("user-123", 250, "pay-uuid-456", occurredAt, "gate");
    expect(res).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("user-123", "pay-uuid-456", 25000, occurredAt, "gate");
    spy.mockRestore();
  });
});

describe("cashxSync canonical formatting", () => {
  it("formats canonical external_payment_id, event_id, and kind for syncCommission", async () => {
    let capturedPayload: cashxClient.EventInput | null = null;
    const clientSpy = spyOn(cashxClient, "sendEvent").mockImplementation(async (payload) => {
      capturedPayload = payload;
      return { status: "accepted" };
    });

    const occurredAt = new Date("2026-09-08T10:00:00Z");
    await cashxSync.syncCommission("user-abc", "pay-999", 50000, occurredAt, "deposit");

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.external_user_id).toBe("user-abc");
    expect(capturedPayload!.external_payment_id).toBe("kazik-pay-pay-999");
    expect(capturedPayload!.event_id).toBe("kazik-payment-pay-999");
    expect(capturedPayload!.type).toBe("revenue.confirmed");
    expect(capturedPayload!.amount_kopecks).toBe(50000);
    expect(capturedPayload!.occurred_at).toBe(occurredAt.toISOString());
    expect(capturedPayload!.kind).toBe("deposit");

    clientSpy.mockRestore();
  });

  it("formats canonical external_payment_id and event_id for syncReversed", async () => {
    let capturedPayload: cashxClient.EventInput | null = null;
    const clientSpy = spyOn(cashxClient, "sendEvent").mockImplementation(async (payload) => {
      capturedPayload = payload;
      return { status: "accepted" };
    });

    await cashxSync.syncReversed("pay-999", "user-abc");

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.external_user_id).toBe("user-abc");
    expect(capturedPayload!.external_payment_id).toBe("kazik-pay-pay-999");
    expect(capturedPayload!.event_id).toBe("kazik-reverse-pay-999");
    expect(capturedPayload!.type).toBe("revenue.reversed");

    clientSpy.mockRestore();
  });
});
