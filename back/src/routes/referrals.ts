import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { referralService } from "../lib/referralService";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const referrals = new Hono<{ Variables: Variables }>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

referrals.get("/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const status = await referralService.getStatus(u.id);
  return c.json(status);
});

referrals.post("/attribute", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const body = (await c.req.json().catch(() => ({}))) as { ref?: string };
  const ok = await referralService.attribute(u.id, String(body.ref || ""));
  return c.json({ attributed: ok });
});

export default referrals;
