import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Партнёрский кабинет переехал в CashX (переиспользуемая партнёрская
// платформа). Запросы на партнёрские домены всегда ведут туда — больше
// никакого рерайта на /partner внутри kazik front.
const CASHX_WEB = process.env.NEXT_PUBLIC_CASHX_WEB_ORIGIN || 'https://cashxpay.cc';

// API_URL приходит из build-time ENV (см. front/Dockerfile, ARG API_URL):
// middleware исполняется на сервере, но не в рантайме standalone-сервера.
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

const partnerDomains = (
  process.env.NEXT_PUBLIC_PARTNER_DOMAIN ??
  process.env.PARTNER_DOMAIN ??
  'cashxpay.cc,cashxpay.pro'
)
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// Гейт «сайт закрыт по просроченному выводу»
//
// Проверяем только документную навигацию обычного домена и только при живой
// сессионной куке: иначе пришлось бы дёргать бэк на каждый RSC-запрос и на
// каждого гостя. Состояние берём из /api/access (ручка вне гейта), ответ
// кэшируем на 5 секунд по куке — этого достаточно, чтобы не молотить бэк при
// переходах, и мало, чтобы разблокировка применялась почти сразу.
// ─────────────────────────────────────────────────────────────────────────────

const ACCESS_CACHE_TTL_MS = 5_000;
const ACCESS_CACHE_MAX_ENTRIES = 1_000;

const accessCache = new Map<string, { locked: boolean; at: number }>();

const ACCESS_EXEMPT_PATHS = [
  '/white',
  '/adminlitgame43144',
  '/gjiweg32tji32',
  '/r',
  '/api',
  '/_next',
  '/images',
  '/img',
  '/favicon.ico',
  '/site.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
  '/Paritypay-6aa4301184c8a.txt',
];

function isAccessExempt(path: string): boolean {
  return ACCESS_EXEMPT_PATHS.some((exempt) => path === exempt || path.startsWith(`${exempt}/`));
}

// better-auth с advanced.cookiePrefix = "kazik" (back/src/lib/auth.ts) ставит
// `kazik.session_token`, а при COOKIE_SECURE — `__Secure-kazik.session_token`;
// чанкованные куки получают числовой суффикс `.0`, `.1`. Матчим имя целиком,
// а не значение, и не привязываемся жёстко к префиксу: подойдёт любой
// `<prefix>.session_token` (в т.ч. с `__Secure-`).
const SESSION_COOKIE_NAME_RE = /^(?:__Secure-)?[a-z0-9._-]*\.session_token(?:\.\d+)?$/i;

function hasSessionCookie(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => {
    const name = part.split('=')[0]?.trim();
    return Boolean(name) && SESSION_COOKIE_NAME_RE.test(name);
  });
}

function rememberAccess(cookie: string, locked: boolean): void {
  if (accessCache.size >= ACCESS_CACHE_MAX_ENTRIES) {
    const oldest = accessCache.keys().next();
    if (!oldest.done) accessCache.delete(oldest.value);
  }
  accessCache.set(cookie, { locked, at: Date.now() });
}

// Дедлайн в прошлом — тоже блокировка: /api/access кэширует состояние на 30 с
// и между истечением срока и протуханием записи ещё отвечает `locked: false`.
// Ручная разблокировка даёт lockedUntil = null и сюда не попадает.
function lockedByResponse(data: { locked?: boolean; lockedUntil?: string | null }): boolean {
  if (data.locked === true) return true;
  if (!data.lockedUntil) return false;
  const deadline = Date.parse(data.lockedUntil);
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

async function isAccessLocked(cookie: string): Promise<boolean> {
  const cached = accessCache.get(cookie);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_TTL_MS) return cached.locked;

  try {
    const res = await fetch(`${API_URL}/api/access`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { locked?: boolean; lockedUntil?: string | null };
    const locked = lockedByResponse(data);
    rememberAccess(cookie, locked);
    return locked;
  } catch {
    // Бэк недоступен или таймаут: не мешаем навигации. Ошибку не кэшируем —
    // следующий переход попробует снова.
    return false;
  }
}

// Документная навигация: sec-fetch-dest === 'document'. Заголовка может не быть
// (старые браузеры, curl) — тогда fallback по Accept: text/html. RSC-переходы
// приходят с sec-fetch-dest: empty и намеренно пропускаются: их гейтит уже
// отрисованный экран (таймер + 403 access_locked), а редирект на HTML внутри
// RSC-запроса ломает роутер. `_rsc` в nextUrl обычно уже вырезан, поэтому
// проверка на него — страховка на будущее, не основной признак.
function isDocumentNavigation(request: NextRequest): boolean {
  const secFetchDest = request.headers.get('sec-fetch-dest');
  if (secFetchDest === 'document') return true;
  if (secFetchDest) return false;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html') && !request.nextUrl.searchParams.has('_rsc');
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const isPartnerDomain = partnerDomains.some((d) => host.includes(d));

  if (isPartnerDomain) {
    // На партнёрских доменах отдаем казинку только /r/:code (redirect),
    // /api/* и _next-статику; всё остальное уходит в CashX.
    const path = request.nextUrl.pathname;
    if (
      path.startsWith('/r/') ||
      path.startsWith('/api/') ||
      path.startsWith('/_next/') ||
      path === '/favicon.ico' ||
      path === '/Paritypay-6aa4301184c8a.txt'
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(CASHX_WEB, 308);
  }

  if (request.method !== 'GET') return NextResponse.next();
  if (!isDocumentNavigation(request)) return NextResponse.next();
  if (isAccessExempt(request.nextUrl.pathname)) return NextResponse.next();

  const cookie = request.headers.get('cookie') ?? '';
  if (!hasSessionCookie(cookie)) return NextResponse.next();

  if (await isAccessLocked(cookie)) {
    return NextResponse.redirect(new URL('/white', request.url), 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
