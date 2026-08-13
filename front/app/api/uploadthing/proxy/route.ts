import type { NextRequest } from "next/server";
import { proxiedFetch } from "@/lib/proxy-fetch";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELAY_RATE_LIMIT = { window: 60, max: 30 } as const;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function isAllowedTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function forwardHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "host") continue;
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    out[key] = value;
  }
  return out;
}

async function relay(req: NextRequest): Promise<Response> {
  const ip = getClientIp(req);
  const limit = await consumeRateLimit(`upload-proxy:${ip}`, RELAY_RATE_LIMIT);
  if (!limit.allowed) {
    return Response.json(
      { message: "Слишком много запросов, попробуйте позже" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const target = isAllowedTarget(req.nextUrl.searchParams.get("target"));
  if (!target) {
    console.log("[UploadProxy] rejected target:", req.nextUrl.searchParams.get("target"));
    return Response.json({ message: "Некорректная цель загрузки" }, { status: 400 });
  }

  const headers = forwardHeaders(req.headers);
  const method = req.method === "HEAD" ? "HEAD" : "PUT";
  const body = method === "PUT" ? req.body : undefined;

  const res = await proxiedFetch(target, {
    method,
    headers,
    body,
    signal: req.signal,
  });

  const responseHeaders = new Headers();
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() === "transfer-encoding") continue;
    responseHeaders.set(key, value);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export async function PUT(req: NextRequest) {
  return relay(req);
}

export async function HEAD(req: NextRequest) {
  return relay(req);
}
