import { createRouteHandler } from "uploadthing/next";
import { uploadRouter } from "./core";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { proxiedFetch } from "@/lib/proxy-fetch";

const { GET, POST: uploadPost } = createRouteHandler({
  router: uploadRouter,
  config: { fetch: proxiedFetch },
});

const UPLOAD_RATE_LIMIT = { window: 60, max: 30 } as const;

const RELAY_PREFIX = "/api/uploadthing/proxy?target=";

// Rewrite the presigned upload URLs returned by uploadthing so the browser
// uploads the file bytes to our own relay route instead of directly to the
// uploadthing CDN. The relay forwards the bytes through the SOCKS5 proxy,
// giving us full coverage when the CDN is blocked.
function rewritePresignedUrls(payload: unknown): unknown {
  if (!Array.isArray(payload)) return payload;
  return payload.map((item) => {
    if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
      const record = item as { url: string };
      return {
        ...record,
        url: `${RELAY_PREFIX}${encodeURIComponent(record.url)}`,
      };
    }
    return item;
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await consumeRateLimit(`upload:${ip}`, UPLOAD_RATE_LIMIT);
  if (!limit.allowed) {
    return Response.json(
      { message: "Слишком много запросов, попробуйте позже" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const res = await uploadPost(req as Parameters<typeof uploadPost>[0]);

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("application/json")) {
    return res;
  }

  try {
    const payload = await res.json();
    const rewritten = rewritePresignedUrls(payload);
    if (rewritten === payload) return res;

    // Rebuild without body-related headers: the original content-length no
    // longer matches the rewritten (longer) URLs and would truncate the body.
    const headers = new Headers();
    for (const [key, value] of res.headers.entries()) {
      const lower = key.toLowerCase();
      if (
        lower === "content-length" ||
        lower === "transfer-encoding" ||
        lower === "content-encoding" ||
        lower === "connection" ||
        lower === "keep-alive"
      ) {
        continue;
      }
      headers.set(key, value);
    }

    return Response.json(rewritten, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch {
    return res;
  }
}

export { GET };
