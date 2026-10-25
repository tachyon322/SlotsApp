'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageFrameProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

// Каркас страницы справа от навбара: шапка + колонка контента + подвал.
// Главная живёт в колонке макета, игры и внутренние страницы — в привычной .hub-main.
export function PageFrame({ header, footer, children }: PageFrameProps) {
  const isHome = usePathname() === '/';

  return (
    <div className="lg-page" data-home={isHome}>
      <div className="lg-wrap">{header}</div>
      <main className="lg-main hub-main">
        {children}
        {footer}
      </main>
    </div>
  );
}
