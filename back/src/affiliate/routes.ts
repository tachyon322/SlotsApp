import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { getWelcomeBonus } from "../lib/config";
import { affiliateService, type SourceInput, type AuthPartner } from "./service";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  partner: AuthPartner;
};

const MAX_PAGE_SIZE = 200;

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

function parsePagination(c: Context): { limit: number; offset: number } {
  const rawLimit = Number(c.req.query("limit"));
  const rawOffset = Number(c.req.query("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

function mapServiceError(c: Context, err: unknown): Response {
  const msg = (err as Error).message;
  switch (msg) {
    case "invalid_bonus":
      return fail(c, "Некорректный размер бонуса", 400);
    case "invalid_code":
      return fail(c, "Код должен содержать 3–32 символа: латиница, цифры, _", 400);
    case "code_taken":
      return fail(c, "Такой код уже используется", 409);
    case "invalid_name":
      return fail(c, "Название не может быть пустым", 400);
    case "invalid_url":
      return fail(c, "Некорректная ссылка", 400);
    case "invalid_domain":
      return fail(c, "Некорректный домен", 400);
    case "domain_not_allowed":
      return fail(c, "Домен не входит в список разрешённых", 400);
    case "source_not_found":
      return fail(c, "Источник не найден", 404);
    case "group_not_found":
      return fail(c, "Поток не найден", 404);
    case "redirect_not_found":
      return fail(c, "Редирект не найден", 404);
    case "url_not_found":
      return fail(c, "Ссылка не найдена", 404);
    case "domain_not_found":
      return fail(c, "Домен не найден", 404);
    case "partner_not_found":
      return fail(c, "Партнёр не найден", 404);
    case "invalid_email":
      return fail(c, "Некорректный email", 400);
    case "email_taken":
      return fail(c, "Аккаунт с таким email уже зарегистрирован", 409);
    case "register_failed":
      return fail(c, "Не удалось создать аккаунт", 400);
    case "invalid_password":
      return fail(c, "Пароль должен быть не короче 6 символов", 400);
    case "cannot_delete_self":
      return fail(c, "Нельзя удалить свой аккаунт", 400);
    case "cannot_delete_owner":
      return fail(c, "Нельзя удалить владельца", 400);
    case "account_pending":
      return fail(c, "Аккаунт ещё не одобрен владельцем", 403);
    case "invalid_commission":
      return fail(c, "Комиссия должна быть в диапазоне 0–100%", 400);
    case "user_not_found":
      return fail(c, "Пользователь не приписан к источникам этого партнёра", 404);
    case "invalid_amount":
      return fail(c, "Некорректная сумма вывода", 400);
    case "below_min_withdraw":
      return fail(c, "Сумма меньше минимального порога вывода", 400);
    case "invalid_rate":
      return fail(c, "Курс вывода не настроен, попробуйте позже", 400);
    case "invalid_requisites":
      return fail(c, "Укажите реквизиты для вывода", 400);
    case "bank_required":
      return fail(c, "Для вывода по СБП укажите банк", 400);
    case "insufficient_balance":
      return fail(c, "Недостаточно средств на балансе", 402);
    case "withdrawal_not_pending":
      return fail(c, "Заявка уже обработана", 409);
    default:
      throw err;
  }
}

function requireOwner(c: Context): AuthPartner | null {
  const p = c.get("partner");
  return p.isOwner ? p : null;
}

const affiliate = new Hono<{ Variables: Variables }>();

affiliate.use("*", async (c, next) => {
  if (c.req.path.endsWith("/attrib")) return next();
  if (c.req.path.endsWith("/registration-bonus")) return next();
  if (c.req.path.endsWith("/auth/login") || c.req.path.endsWith("/auth/register")) return next();
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const partner = token ? await affiliateService.resolvePartner(token) : undefined;
  if (!partner) return fail(c, "Unauthorized", 401);
  c.set("partner", partner);
  return next();
});

affiliate.post("/auth/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  try {
    const result = await affiliateService.login(String(body.email || ""), String(body.password || ""));
    if (!result) return fail(c, "Неверный email или пароль", 401);
    return c.json(result);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.post("/auth/register", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
  };
  try {
    const result = await affiliateService.register(body);
    return c.json(result, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.get("/registration-bonus", async (c) => {
  const ref = String(c.req.query("ref") || "").trim();
  const resolved = ref ? await affiliateService.resolveRegistrationSource(ref) : null;
  const bonus = resolved
    ? (resolved.bonus ?? (await getWelcomeBonus()))
    : await getWelcomeBonus();
  return c.json({ bonus });
});

affiliate.get("/auth/me", async (c) => {
  return c.json({ partner: c.get("partner") });
});

affiliate.get("/stats", async (c) => {
  const stats = await affiliateService.getStats(
    {
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    },
    c.get("partner").id,
  );
  return c.json(stats);
});

affiliate.get("/leaderboard", async (c) => {
  const data = await affiliateService.getLeaderboard({
    period: c.req.query("period") || undefined,
    metric: c.req.query("metric") || undefined,
  });
  return c.json(data);
});

affiliate.get("/referrals", async (c) => {
  const data = await affiliateService.getReferrals(c.get("partner").id, {
    from: c.req.query("from") || undefined,
    to: c.req.query("to") || undefined,
  });
  return c.json(data);
});

affiliate.get("/transactions", async (c) => {
  const items = await affiliateService.listTransactions(c.get("partner").id);
  return c.json({ items });
});

affiliate.get("/payout/config", async (c) => {
  const config = await affiliateService.getPayoutConfig();
  return c.json(config);
});

affiliate.get("/withdrawals", async (c) => {
  const items = await affiliateService.listWithdrawals({ partnerId: c.get("partner").id });
  return c.json({ items });
});

affiliate.post("/withdrawals", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    method?: string;
    amount?: number;
    requisites?: string;
    bank?: string;
  };
  try {
    const withdrawal = await affiliateService.requestWithdrawal(c.get("partner").id, body);
    return c.json({ withdrawal }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.get("/config", async (c) => {
  const [domains, defaultDomain] = await Promise.all([
    affiliateService.allowedDomains(),
    affiliateService.defaultDomain(),
  ]);
  return c.json({ domains, defaultDomain });
});

affiliate.get("/domains", async (c) => {
  const items = await affiliateService.listDomains();
  return c.json({ items });
});

affiliate.post("/domains", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    url?: string;
    isActive?: boolean;
    comment?: string;
  };
  try {
    const domain = await affiliateService.createDomain(body);
    return c.json({ domain }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/domains/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    url?: string;
    isActive?: boolean;
    comment?: string;
  };
  try {
    const domain = await affiliateService.updateDomain(c.req.param("id"), body);
    return c.json({ domain });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/domains/:id", async (c) => {
  await affiliateService.deleteDomain(c.req.param("id"));
  return c.json({ success: true });
});

affiliate.get("/sources", async (c) => {
  const { limit, offset } = parsePagination(c);
  const data = await affiliateService.listSources(
    {
      limit,
      offset,
      search: c.req.query("search") || undefined,
      groupId: c.req.query("groupId") || undefined,
      type: (c.req.query("type") as "link" | "promo" | undefined) || undefined,
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    },
    c.get("partner").id,
  );
  return c.json(data);
});

affiliate.get("/sources/:id/stats", async (c) => {
  try {
    const data = await affiliateService.getSourceStats(c.req.param("id"), {
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    }, c.get("partner").id);
    return c.json({ items: data });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.post("/sources", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as SourceInput;
  try {
    const source = await affiliateService.createSource(body, c.get("partner").id);
    return c.json({ source }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/sources/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as SourceInput;
  try {
    const source = await affiliateService.updateSource(c.req.param("id"), body, c.get("partner").id);
    return c.json({ source });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/sources/:id", async (c) => {
  await affiliateService.deleteSource(c.req.param("id"), c.get("partner").id);
  return c.json({ success: true });
});

// ------------------------------------------------------------ partners (owner)

affiliate.get("/partners", async (c) => {
  const owner = requireOwner(c);
  if (!owner) return fail(c, "Forbidden", 403);
  const items = await affiliateService.listPartners();
  return c.json({ items });
});

affiliate.post("/partners", async (c) => {
  const owner = requireOwner(c);
  if (!owner) return fail(c, "Forbidden", 403);
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
    commissionPercent?: number;
    comment?: string;
  };
  try {
    const created = await affiliateService.createPartner(body);
    return c.json(created, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/partners/:id", async (c) => {
  const owner = requireOwner(c);
  if (!owner) return fail(c, "Forbidden", 403);
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    password?: string;
    isActive?: boolean;
    commissionPercent?: number;
    comment?: string;
  };
  try {
    const partner = await affiliateService.updatePartner(c.req.param("id"), body);
    return c.json({ partner });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/partners/:id", async (c) => {
  const owner = requireOwner(c);
  if (!owner) return fail(c, "Forbidden", 403);
  try {
    await affiliateService.deletePartner(c.req.param("id"), owner.id);
    return c.json({ success: true });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

// Owner-only: referred users of a specific partner.
affiliate.get("/partners/:id/referrals", async (c) => {
  const owner = requireOwner(c);
  if (!owner) return fail(c, "Forbidden", 403);
  const data = await affiliateService.getReferrals(c.req.param("id"), {
    from: c.req.query("from") || undefined,
    to: c.req.query("to") || undefined,
  });
  return c.json(data);
});

affiliate.get("/groups", async (c) => {
  const items = await affiliateService.listGroups();
  return c.json({ items });
});

affiliate.post("/groups", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    comment?: string;
  };
  try {
    const group = await affiliateService.createGroup(body);
    return c.json({ group }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/groups/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    comment?: string;
  };
  try {
    const group = await affiliateService.updateGroup(c.req.param("id"), body);
    return c.json({ group });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/groups/:id", async (c) => {
  await affiliateService.deleteGroup(c.req.param("id"));
  return c.json({ success: true });
});

affiliate.get("/redirects", async (c) => {
  const items = await affiliateService.listRedirects();
  return c.json({ items });
});

affiliate.post("/redirects", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    comment?: string;
    urls?: string[];
  };
  try {
    const redirect = await affiliateService.createRedirect(body);
    return c.json({ redirect }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/redirects/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    comment?: string;
  };
  try {
    const redirect = await affiliateService.updateRedirect(c.req.param("id"), body);
    return c.json({ redirect });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/redirects/:id", async (c) => {
  await affiliateService.deleteRedirect(c.req.param("id"));
  return c.json({ success: true });
});

affiliate.post("/redirects/:id/urls", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    url?: string;
    weight?: number;
  };
  try {
    const url = await affiliateService.addRedirectUrl(c.req.param("id"), body);
    return c.json({ url }, 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.patch("/redirects/:id/urls/:urlId", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    url?: string;
    weight?: number;
    isActive?: boolean;
  };
  try {
    const url = await affiliateService.updateRedirectUrl(c.req.param("id"), c.req.param("urlId"), body);
    return c.json({ url });
  } catch (err) {
    return mapServiceError(c, err);
  }
});

affiliate.delete("/redirects/:id/urls/:urlId", async (c) => {
  await affiliateService.deleteRedirectUrl(c.req.param("id"), c.req.param("urlId"));
  return c.json({ success: true });
});

affiliate.post("/attrib", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const body = (await c.req.json().catch(() => ({}))) as { ref?: string };
  const ok = await affiliateService.attributeUser(u.id, String(body.ref || ""));
  return c.json({ attributed: ok });
});

const redirect = new Hono();

redirect.get("/:code", async (c) => {
  const code = c.req.param("code");
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-real-ip") ||
    "";
  const result = await affiliateService.resolveLink(code, {
    ip,
    userAgent: c.req.header("user-agent"),
    referrer: c.req.header("referer") || c.req.header("referrer"),
  });
  if (!result) return c.json({ message: "Not found" }, 404);
  return c.json(result);
});

export { affiliate as affiliateRoutes, redirect as redirectRoutes };
