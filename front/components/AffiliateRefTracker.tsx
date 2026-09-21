'use client';

import { useEffect } from 'react';

const AFF_REF_KEY = 'litgame:aff_ref';
const CLICK_TOKEN_KEY = 'litgame:click_token';
// Player referrals are a separate namespace from affiliate/partner codes:
// they never mix so a friend's invite code can't be attributed to a partner.
const INVITE_REF_KEY = 'litgame:invite_ref';

export function getAffiliateRef(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = localStorage.getItem(AFF_REF_KEY);
    if (val) return val;
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef) return urlRef.trim().toUpperCase();
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const affCookie = cookies.find((c) => c.startsWith('aff_ref='));
    if (affCookie) {
      return decodeURIComponent(affCookie.split('=')[1] || '').trim().toUpperCase();
    }
    return '';
  } catch {
    return '';
  }
}

export function getClickToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = localStorage.getItem(CLICK_TOKEN_KEY);
    if (val) return val;
    const urlToken = new URLSearchParams(window.location.search).get('click_token');
    if (urlToken) return urlToken.trim();
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const clickCookie = cookies.find((c) => c.startsWith('click_token='));
    if (clickCookie) {
      return decodeURIComponent(clickCookie.split('=')[1] || '').trim();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Player invite code (?invite=CODE or the invite_ref cookie set by the
 * /invite/[code] route). Kept apart from the affiliate ref so the backend can
 * attribute the referral without ever forwarding it to CashX.
 */
export function getInviteRef(): string {
  if (typeof window === 'undefined') return '';
  try {
    const val = localStorage.getItem(INVITE_REF_KEY);
    if (val) return val;
    const urlRef = new URLSearchParams(window.location.search).get('invite');
    if (urlRef) return urlRef.trim().toUpperCase();
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const inviteCookie = cookies.find((c) => c.startsWith('invite_ref='));
    if (inviteCookie) {
      return decodeURIComponent(inviteCookie.split('=')[1] || '').trim().toUpperCase();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Captures tracking data into localStorage/cookies so it survives navigation
 * and can be passed to the backend on registration:
 * - affiliate ref from ?ref=CODE or the aff_ref cookie (set by /r/[code]),
 * - player invite from ?invite=CODE or the invite_ref cookie (set by /invite/[code]),
 * - click_token from ?click_token=... for CashX attribution.
 */
export function AffiliateRefTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref')?.trim().toUpperCase();
      const invite = params.get('invite')?.trim().toUpperCase();
      const clickToken = params.get('click_token')?.trim();
      let handled = false;
      if (ref) {
        localStorage.setItem(AFF_REF_KEY, ref);
        document.cookie = `aff_ref=${encodeURIComponent(ref)}; Path=/; Max-Age=${90 * 86400}`;
        params.delete('ref');
        handled = true;
      }
      if (invite) {
        localStorage.setItem(INVITE_REF_KEY, invite);
        document.cookie = `invite_ref=${encodeURIComponent(invite)}; Path=/; Max-Age=${90 * 86400}`;
        params.delete('invite');
        handled = true;
      }
      if (clickToken) {
        localStorage.setItem(CLICK_TOKEN_KEY, clickToken);
        document.cookie = `click_token=${encodeURIComponent(clickToken)}; Path=/; Max-Age=${90 * 86400}`;
        params.delete('click_token');
        handled = true;
      }
      if (handled) {
        const qs = params.toString();
        const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState(null, '', next);
      }

      const cookies = document.cookie.split(';').map((c) => c.trim());
      if (!localStorage.getItem(AFF_REF_KEY)) {
        const affCookie = cookies.find((c) => c.startsWith('aff_ref='));
        if (affCookie) {
          const value = decodeURIComponent(affCookie.split('=')[1] || '').trim().toUpperCase();
          if (value) localStorage.setItem(AFF_REF_KEY, value);
        }
      }
      if (!localStorage.getItem(CLICK_TOKEN_KEY)) {
        const clickCookie = cookies.find((c) => c.startsWith('click_token='));
        if (clickCookie) {
          const value = decodeURIComponent(clickCookie.split('=')[1] || '').trim();
          if (value) localStorage.setItem(CLICK_TOKEN_KEY, value);
        }
      }
      if (!localStorage.getItem(INVITE_REF_KEY)) {
        const inviteCookie = cookies.find((c) => c.startsWith('invite_ref='));
        if (inviteCookie) {
          const value = decodeURIComponent(inviteCookie.split('=')[1] || '').trim().toUpperCase();
          if (value) localStorage.setItem(INVITE_REF_KEY, value);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  return null;
}
