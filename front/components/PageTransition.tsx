'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

const variants: Variants = {
  enter: {
    opacity: 0,
    y: 40,
  },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -32,
    transition: { duration: 0.16, ease: 'easeIn' },
  },
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const isBack = useRef(false);
  const prevPathname = useRef(pathname);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      isBack.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (prevPathname.current === pathname) return;
    const back = isBack.current;
    isBack.current = false;
    prevPathname.current = pathname;
    setLeaving(false);
    if (!back) window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), 2000);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    const onCaptureClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (leaving) return;
      const el = (e.target as Element | null)?.closest?.('a');
      if (!el) return;
      const a = el as HTMLAnchorElement;
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (href.startsWith('/r/')) return;
      if (href.includes('?') || href.includes('#')) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      setLeaving(true);
    };
    document.addEventListener('click', onCaptureClick, true);
    return () => document.removeEventListener('click', onCaptureClick, true);
  }, [leaving]);

  if (reducedMotion) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={variants}
        initial="enter"
        animate={leaving ? 'exit' : 'center'}
        exit="exit"
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
