import { NextResponse } from 'next/server';

const REDIRECT_BASE = process.env.NEXT_PUBLIC_CASHX_REDIRECT_BASE || 'https://cashxpay.cc';
const FALLBACK_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code) return NextResponse.redirect(FALLBACK_ORIGIN, 302);

  // Clicks are recorded by CashX (single source of truth): /c/:code records
  // the click, signs a click_token and 302s to the weighted destination with
  // ?click_token= appended. The kazik AffiliateRefTracker picks up the token
  // from the final URL.
  return NextResponse.redirect(`${REDIRECT_BASE}/c/${encodeURIComponent(code)}`, 302);
}
