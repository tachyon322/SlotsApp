import { afterEach, beforeAll, describe, expect, it } from "bun:test";

// cashxConfig reads the env at import time, so enable sync before loading.
process.env.KAZIK_CASHX_SYNC = "true";
process.env.KAZIK_CASHX_KEY_ID = "test-key";
process.env.KAZIK_CASHX_SECRET = "test-secret";
process.env.KAZIK_CASHX_BASE_URL = "https://cashx.test";

let lookupSource: typeof import("./client").lookupSource;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  ({ lookupSource } = await import("./client"));
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const sourceBody = {
  code: "STARX",
  type: "link",
  is_promo: false,
  is_active: true,
  access_active: true,
  registration_bonus: 7000,
};

/** Replace fetch with a scripted sequence of outcomes; returns the call log. */
function scriptFetch(steps: Array<Error | Response>): { calls: number; timestamps: string[] } {
  const log = { calls: 0, timestamps: [] as string[] };
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const step = steps[Math.min(log.calls, steps.length - 1)];
    log.calls++;
    log.timestamps.push(String((init?.headers as Record<string, string>)?.["X-CashX-Timestamp"] ?? ""));
    if (step instanceof Error) throw step;
    return step.clone();
  }) as typeof fetch;
  return log;
}

const dnsError = () => Object.assign(new Error("getaddrinfo EAI_AGAIN cashx.test"), { code: "EAI_AGAIN" });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("lookupSource retries", () => {
  it("recovers from a transient DNS failure and returns the custom bonus", async () => {
    const log = scriptFetch([dnsError(), json(200, sourceBody)]);
    const info = await lookupSource("starx");
    expect(info?.registration_bonus).toBe(7000);
    expect(log.calls).toBe(2);
    expect(log.timestamps.every((t) => t.length > 0)).toBe(true);
  });

  it("retries 5xx and succeeds", async () => {
    const log = scriptFetch([json(502, { message: "bad gateway" }), json(200, sourceBody)]);
    const info = await lookupSource("STARX");
    expect(info?.code).toBe("STARX");
    expect(log.calls).toBe(2);
  });

  it("returns null on 404 without retrying", async () => {
    const log = scriptFetch([json(404, { message: "source_not_found" })]);
    expect(await lookupSource("NOPE")).toBeNull();
    expect(log.calls).toBe(1);
  });

  it("does not retry a rejected request (4xx) and throws", async () => {
    const log = scriptFetch([json(401, { message: "invalid_signature" })]);
    await expect(lookupSource("STARX")).rejects.toThrow("cashx source lookup 401");
    expect(log.calls).toBe(1);
  });

  it("throws after three failed attempts", async () => {
    const log = scriptFetch([dnsError()]);
    await expect(lookupSource("STARX")).rejects.toThrow("EAI_AGAIN");
    expect(log.calls).toBe(3);
  });
});
