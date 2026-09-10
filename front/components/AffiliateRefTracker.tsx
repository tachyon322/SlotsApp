'use client';

import { useEffect } from 'react';

const AFF_REF_KEY = 'litgame:aff_ref';
const CLICK_TOKEN_KEY = 'litgame:click_token';

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
        document.cookie = `aff_ref=${encodeURIComponent(ref)}; Path=/; Max-Age=${90 * 86400}`;
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
    } catch {
      // ignore
    }
  }, []);

  return null;
}
