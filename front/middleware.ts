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
// каждого гостя.
//
// Вместо редиректа отдаём собственный HTML-документ прелоадера: rewrite на
// отдельный роут App Router роутер потом «исправляет» клиентским переходом на
// исходный URL и показывает настоящую страницу. Свой документ рендерится без
// Next вообще, URL сохраняется, гидратации нет. Внутри — один запрос /api/me:
// пока сервер блокирует — остаёмся, отпустил — перезагружаемся на тот же URL.
//
// Если сессия протухла, middleware про блокировку не знает — этот случай
// закрывает inline-скрипт в root-layout по флагу localStorage.
// ─────────────────────────────────────────────────────────────────────────────

const PRELOAD_PATH = '/preload';

// Стили дублируются с globals.css осознанно: документ отдаётся в обход Next,
// и подключить сюда хешированный бандл нельзя.
const PRELOAD_HTML = `<!doctype html><html lang="ru" data-site-locked="1"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LITGAME GAMES</title><style>html,body{margin:0;height:100%;background:#090d16}body{display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,-apple-system,sans-serif}.site-lock-stack{display:flex;flex-direction:column;align-items:center;gap:20px}.site-lock-mark{width:64px;height:64px;opacity:.9;filter:drop-shadow(0 0 18px rgba(89,233,255,.35));animation:site-lock-breathe 2.4s ease-in-out infinite}.site-lock-bar{position:relative;width:168px;height:2px;overflow:hidden;border-radius:999px;background:rgba(248,250,252,.12)}.site-lock-bar:after{content:"";position:absolute;top:0;left:0;width:40%;height:100%;border-radius:999px;background:linear-gradient(90deg,transparent,#59e9ff,transparent);animation:site-lock-slide 1.3s ease-in-out infinite}@keyframes site-lock-breathe{0%,100%{opacity:.55;transform:scale(.97)}50%{opacity:1;transform:scale(1)}}@keyframes site-lock-slide{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}</style></head><body><div class="site-lock-stack" id="site-lock-overlay" role="status" aria-live="polite" aria-label="Загрузка"><img class="site-lock-mark" src="/newVisual/brand-mark.svg" alt=""><span class="site-lock-bar" aria-hidden="true"></span></div><script>try{localStorage.setItem("kazik:site-lock",JSON.stringify({at:Date.now()}))}catch(e){}fetch("/api/me",{cache:"no-store",credentials:"include"}).then(function(r){if(r.status===401){try{localStorage.removeItem("kazik:site-lock")}catch(e){}location.replace("/");return null}if(!r.ok)return null;return r.json()}).then(function(d){if(!d||d.accessLocked)return;try{localStorage.removeItem("kazik:site-lock")}catch(e){}location.reload()}).catch(function(){})</script></body></html>`;

const ACCESS_EXEMPT_PATHS = [
  PRELOAD_PATH,
  '/white',
  '/adminlitgame43144',
  '/gjiweg32tji32',
  '/r',
  '/devtest',
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

// Дедлайн в прошлом — тоже блокировка: /api/access кэширует состояние на 30 с
// и между истечением срока и протуханием записи ещё отвечает `locked: false`.
function lockedByResponse(data: { locked?: boolean; lockedUntil?: string | null }): boolean {
  if (data.locked === true) return true;
  if (!data.lockedUntil) return false;
  const deadline = Date.parse(data.lockedUntil);
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

async function isAccessLocked(cookie: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/access`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { locked?: boolean; lockedUntil?: string | null };
    return lockedByResponse(data);
  } catch {
    // Бэк недоступен или таймаут: не мешаем навигации.
    return false;
  }
}

// Документная навигация: sec-fetch-dest === 'document'. Заголовка может не быть
// (старые браузеры, curl) — тогда fallback по Accept: text/html. RSC-переходы
// приходят с sec-fetch-dest: empty и намеренно пропускаются: их гейтит уже
// отрисованный экран (таймер + 403 access_locked), а подмена HTML внутри
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
    return new NextResponse(PRELOAD_HTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'x-site-lock': '1',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
