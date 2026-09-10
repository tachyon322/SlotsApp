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

describe("affiliateService.resolveRegistrationSource", () => {
  it("returns null if both ref and clickToken are empty", async () => {
    const res = await affiliateService.resolveRegistrationSource("", "");
    expect(res).toBeNull();
  });

  it("resolves via lookupSource when clickToken is provided", async () => {
    const lookupSpy = spyOn(cashxClient, "lookupSource").mockResolvedValue({
      code: "AFF123",
      type: "link",
      is_promo: false,
      is_active: true,
      access_active: true,
      registration_bonus: 1500,
    });

    const res = await affiliateService.resolveRegistrationSource(undefined, "click-token-abc");
    expect(lookupSpy).toHaveBeenCalledWith(undefined, "click-token-abc");
    expect(res).toEqual({ sourceId: "AFF123", bonus: 1500 });

    lookupSpy.mockRestore();
  });

  it("resolves bonus as null when source has no custom bonus", async () => {
    const lookupSpy = spyOn(cashxClient, "lookupSource").mockResolvedValue({
      code: "AFFDEFAULT",
      type: "link",
      is_promo: false,
      is_active: true,
      access_active: true,
    });

    const res = await affiliateService.resolveRegistrationSource("AFFDEFAULT", "token-xyz");
    expect(lookupSpy).toHaveBeenCalledWith("AFFDEFAULT", "token-xyz");
    expect(res).toEqual({ sourceId: "AFFDEFAULT", bonus: null });

    lookupSpy.mockRestore();
  });

  it("returns null when source is inactive", async () => {
    const lookupSpy = spyOn(cashxClient, "lookupSource").mockResolvedValue({
      code: "AFFINACTIVE",
      type: "link",
      is_promo: false,
      is_active: false,
      access_active: true,
      registration_bonus: 2000,
    });

    const res = await affiliateService.resolveRegistrationSource("AFFINACTIVE");
    expect(res).toBeNull();

    lookupSpy.mockRestore();
  });

  it("resolves custom bonus when both ref and clickToken are provided", async () => {
    const lookupSpy = spyOn(cashxClient, "lookupSource").mockResolvedValue({
      code: "AFF123",
      type: "link",
      is_promo: false,
      is_active: true,
      access_active: true,
      registration_bonus: 3000,
    });

    const res = await affiliateService.resolveRegistrationSource("AFF123", "token-abc");
    expect(lookupSpy).toHaveBeenCalledWith("AFF123", "token-abc");
    expect(res).toEqual({ sourceId: "AFF123", bonus: 3000 });

    lookupSpy.mockRestore();
  });

  it("returns null when lookupSource throws and no local archive source exists", async () => {
    const lookupSpy = spyOn(cashxClient, "lookupSource").mockRejectedValue(new Error("network timeout"));

    const res = await affiliateService.resolveRegistrationSource(undefined, "token-abc");
    expect(res).toBeNull();

    lookupSpy.mockRestore();
  });
});
