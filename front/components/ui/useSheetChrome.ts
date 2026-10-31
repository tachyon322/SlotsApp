'use client';

import { useEffect } from 'react';

/** Шторки на LgSheet: блокировка скролла body и закрытие по Escape (LgSheet — чистая разметка). */
export function useSheetChrome(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
}
