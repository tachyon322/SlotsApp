export const PARTNER_TOKEN_COOKIE = 'partner_token';
const PARTNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function setPartnerTokenCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${PARTNER_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; samesite=lax; max-age=${PARTNER_COOKIE_MAX_AGE}`;
}

export function clearPartnerTokenCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${PARTNER_TOKEN_COOKIE}=; path=/; max-age=0`;
}

export function readPartnerTokenCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${PARTNER_TOKEN_COOKIE}=([^;]*)`));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
