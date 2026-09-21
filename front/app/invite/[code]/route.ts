import { NextResponse } from 'next/server';

/**
 * Player referral links: /invite/:code stays on the casino site (unlike the
 * affiliate /r/:code which redirects to CashX). We only remember the invite
 * code in a cookie and send the visitor to the lobby, where they can register
 * and get attributed to the inviter via /api/referrals/attribute.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = new URL('/', req.url);
  if (!code) return NextResponse.redirect(target, 302);

  const res = NextResponse.redirect(target, 302);
  res.cookies.set('invite_ref', code, {
    path: '/',
    maxAge: 90 * 86400,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
