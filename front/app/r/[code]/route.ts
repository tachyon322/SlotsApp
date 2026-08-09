import { NextResponse } from 'next/server';

const API = process.env.API_URL ?? 'http://localhost:8080';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  // Пробрасываем клиентские заголовки в backend: без реального IP
  // уникальные переходы не считаются (HLL/DB по IP), а rate-limit
  // по /r/ валит всех в один бакет ip:unknown.
  const headers = new Headers();
  for (const name of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'user-agent', 'referer', 'referrer']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const res = await fetch(`${API}/r/${encodeURIComponent(code)}`, { cache: 'no-store', headers });
    if (res.ok) {
      const data = (await res.json()) as { url?: string; code?: string };
      const refCode = data.code || code;
      const target = new URL(data.url || '/', req.url);
      if (!target.searchParams.has('ref')) target.searchParams.set('ref', refCode);

      const response = NextResponse.redirect(target, 302);
      response.cookies.set('aff_ref', refCode, {
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
      });
      return response;
    }
  } catch {
    // fall through to home
  }

  const fallback = new URL('/', req.url);
  fallback.searchParams.set('ref', code);
  return NextResponse.redirect(fallback, 302);
}
