import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const url = request.nextUrl.clone();

  // Домен партнерки (поддерживаем старый .pro на переходный период)
  const partnerDomains = (
    process.env.NEXT_PUBLIC_PARTNER_DOMAIN ??
    process.env.PARTNER_DOMAIN ??
    'cashxpay.cc,cashxpay.pro'
  )
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const isPartnerDomain = partnerDomains.some((d) => host.includes(d));

  if (isPartnerDomain) {
    // 1. Главная страница partner -> отдает /partner
    if (url.pathname === '/') {
      url.pathname = '/partner';
      return NextResponse.rewrite(url);
    }

    // 2. Внутренние страницы partner-domain.com/referrals -> отдает /partner/referrals
    if (
      !url.pathname.startsWith('/partner') &&
      !url.pathname.startsWith('/_next') &&
      !url.pathname.startsWith('/api') &&
      !url.pathname.startsWith('/r')
    ) {
      url.pathname = `/partner${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};