import { NextResponse } from 'next/server';

/**
 * Player referral links: /invite/:code stays on the casino site (unlike the
 * affiliate /r/:code which redirects to CashX). We only remember the invite
 * code in a cookie and send the visitor to the lobby, where they can register
 * and get attributed to the inviter via /api/referrals/attribute.
 *
 * The redirect target is deliberately relative: building an absolute URL from
 * `req.url` leaks the internal bind address (0.0.0.0) or a proxy scheme/host
 * instead of the origin the visitor is actually on.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = code ? `/?invite=${encodeURIComponent(code)}` : '/';

  const res = new NextResponse(null, { status: 302, headers: { Location: url } });
  if (code) {
    res.cookies.set('invite_ref', code, {
      path: '/',
      maxAge: 90 * 86400,
      sameSite: 'lax',
      httpOnly: false,
    });
  }
  return res;
}
