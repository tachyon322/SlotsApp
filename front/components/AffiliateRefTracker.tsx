'use client';

import { useEffect } from 'react';

const AFF_REF_KEY = 'litgame:aff_ref';

export function getAffiliateRef(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(AFF_REF_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Captures the affiliate ref from the URL (?ref=CODE) or the aff_ref cookie
 * (set by /r/[code] redirects) into localStorage so it survives navigation and
 * can be passed to the backend on registration.
 */
export function AffiliateRefTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref')?.trim().toUpperCase();
      if (ref) {
        localStorage.setItem(AFF_REF_KEY, ref);
        params.delete('ref');
        const qs = params.toString();
        const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState(null, '', next);
        return;
      }

      const cookie = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('aff_ref='));
      if (cookie) {
        const value = decodeURIComponent(cookie.split('=')[1] || '');
        if (value) localStorage.setItem(AFF_REF_KEY, value);
      }
    } catch {
      // ignore
    }
  }, []);

  return null;
}
