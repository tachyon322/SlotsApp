import { createRouteHandler } from "uploadthing/next";
import { uploadRouter } from "./core";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

const { GET, POST: uploadPost } = createRouteHandler({
  router: uploadRouter,
});

const UPLOAD_RATE_LIMIT = { window: 60, max: 30 } as const;

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
  return uploadPost(req as Parameters<typeof uploadPost>[0]);
}

export { GET };
