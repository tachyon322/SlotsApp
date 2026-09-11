import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Партнёрский кабинет переехал в CashX (переиспользуемая партнёрская
// платформа). Запросы на партнёрские домены всегда ведут туда — больше
// никакого рерайта на /partner внутри kazik front.
const CASHX_WEB = process.env.NEXT_PUBLIC_CASHX_WEB_ORIGIN || 'https://cashxpay.cc';

const partnerDomains = (
  process.env.NEXT_PUBLIC_PARTNER_DOMAIN ??
  process.env.PARTNER_DOMAIN ??
  'cashxpay.cc,cashxpay.pro'
)
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export function middleware(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
