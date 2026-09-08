'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface CasesSheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  title: ReactNode;
  children: ReactNode;
}

/**
 * Нижний лист референса (cs-sheetScrim + cs-sheet): фикс-позиционирование,
 * Esc / клик по скриму закрывают, скролл body блокируется на время открытия.
 * Рендерится внутри .cs-shell (не портал) — var-шим доступен.
 */
export function CasesSheet({ open, onClose, label, title, children }: CasesSheetProps) {
  const [mounted, setMounted] = useState(false);
  const scrollYRef = useRef(0);
  const lockedRef = useRef(false);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      if (!lockedRef.current) {
        scrollYRef.current = window.scrollY;
        const style = document.body.style;
        style.position = 'fixed';
        style.top = `-${scrollYRef.current}px`;
        style.left = '0';
        style.right = '0';
        style.width = '100%';
        style.overflow = 'hidden';
        lockedRef.current = true;
      }
    } else {
      setMounted(false);
      if (lockedRef.current) {
        const style = document.body.style;
        style.position = '';
        style.top = '';
        style.left = '';
        style.right = '';
        style.width = '';
        style.overflow = '';
        window.scrollTo(0, scrollYRef.current);
        lockedRef.current = false;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <>
      <div className="cs-sheetScrim" onClick={onClose} aria-hidden="true" />
      <div className="cs-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="cs-sheetHead">
          <strong className="cs-sheetTitle">{title}</strong>
          <button type="button" className="cs-sheetClose" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
