import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  try {
    const res = await fetch(`${API}/r/${encodeURIComponent(code)}`, { cache: 'no-store' });
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
