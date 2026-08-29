'use client';

import { useEffect } from 'react';

const AFF_REF_KEY = 'litgame:aff_ref';
const CLICK_TOKEN_KEY = 'litgame:click_token';

export function getAffiliateRef(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(AFF_REF_KEY) || '';
  } catch {
    return '';
  }
}

export function getClickToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(CLICK_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Captures the affiliate ref from the URL (?ref=CODE) or the aff_ref cookie
 * (set by /r/[code] redirects) into localStorage so it survives navigation and
 * can be passed to the backend on registration.
 * Also captures click_token from ?click_token=... for CashX dual-write.
 */
export function AffiliateRefTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref')?.trim().toUpperCase();
      const clickToken = params.get('click_token')?.trim();
      let handled = false;
      if (ref) {
        localStorage.setItem(AFF_REF_KEY, ref);
        params.delete('ref');
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
        // ensure aff_ref cookie already captured if we had click_token without ref, continue to cookie check
        if (clickToken && !ref) {
          // fall through to cookie check for aff_ref
        } else {
          return;
        }
      }

      const cookies = document.cookie.split(';').map((c) => c.trim());
      const affCookie = cookies.find((c) => c.startsWith('aff_ref='));
      if (affCookie) {
        const value = decodeURIComponent(affCookie.split('=')[1] || '');
        if (value) localStorage.setItem(AFF_REF_KEY, value);
      }
      const clickCookie = cookies.find((c) => c.startsWith('click_token='));
      if (clickCookie) {
        const value = decodeURIComponent(clickCookie.split('=')[1] || '');
        if (value) localStorage.setItem(CLICK_TOKEN_KEY, value);
      }
    } catch {
      // ignore
    }
  }, []);

  return null;
}
