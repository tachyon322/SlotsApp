'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  maxWidthClass?: string;
  children: ReactNode;
}

export function ModalShell({
  open,
  onClose,
  titleId,
  maxWidthClass = 'max-w-[32rem]',
  children,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const scrollYRef = useRef(0);
  const bodyLockedRef = useRef(false);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      if (!bodyLockedRef.current) {
        scrollYRef.current = window.scrollY;
        const style = document.body.style;
        style.position = 'fixed';
        style.top = `-${scrollYRef.current}px`;
        style.left = '0';
        style.right = '0';
        style.width = '100%';
        style.overflow = 'hidden';
        bodyLockedRef.current = true;
      }
    } else {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        if (bodyLockedRef.current) {
          const style = document.body.style;
          style.position = '';
          style.top = '';
          style.left = '';
          style.right = '';
          style.width = '';
          style.overflow = '';
          window.scrollTo(0, scrollYRef.current);
          bodyLockedRef.current = false;
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain">
      <div className="min-h-dvh flex items-end justify-center p-0 md:items-center md:p-md">
        <div
          className={`fixed inset-0 bg-black/70 will-change-[opacity] ${
            closing
              ? 'animate-[modal-backdrop-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[modal-backdrop-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`relative w-full min-w-[300px] sm:min-w-[480px] ${maxWidthClass} rounded-t-card md:rounded-card bg-gradient-to-b from-zinc-950 to-black border border-zinc-800 shadow-2xl shadow-black/50 max-h-[calc(90dvh-24px)] md:max-h-[85vh] overflow-hidden will-change-[transform,opacity] ${
            closing
              ? 'animate-[sheet-out_0.2s_cubic-bezier(0.4,0,1,1)_both] md:animate-[modal-panel-out_0.2s_cubic-bezier(0.4,0,1,1)_both]'
              : 'animate-[sheet-in_0.3s_cubic-bezier(0.16,1,0.3,1)_both] md:animate-[modal-panel-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]'
          }`}
        >
          <div className="absolute top-xs left-1/2 -translate-x-1/2 z-10 md:hidden">
            <div className="w-10 h-1 rounded-pill bg-zinc-700" />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-md right-md p-xs hover:bg-zinc-800 rounded-button transition-colors z-10"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>

          <div className="overflow-y-auto overscroll-contain max-h-[calc(90dvh-24px)] md:max-h-[calc(85vh-24px)]">
            <div className="px-6 pt-6 mt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:mt-0 md:pt-12">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
