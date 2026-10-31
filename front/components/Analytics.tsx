'use client';

import Script from 'next/script';
import { flushQueue } from '@/lib/analytics';

// NEXT_PUBLIC_* инлайнятся в бандл на сборке, поэтому смена website ID
// требует пересборки образа, а не только перезапуска контейнера.
const SRC = (process.env.NEXT_PUBLIC_UMAMI_SRC ?? '').replace(/\/+$/, '');
const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '';
// Домены проекта: у Litgame и StarX свои website-id и свой список доменов,
// поэтому значение приходит со сборки (NEXT_PUBLIC_UMAMI_DOMAINS), а не из кода.
// Пустое значение — трекер работает на любом домене (Umami всё равно делит
// статистику по website-id).
const DOMAINS = process.env.NEXT_PUBLIC_UMAMI_DOMAINS ?? '';

export function Analytics() {
  if (!SRC || !WEBSITE_ID) return null;

  return (
    <Script
      id="umami-tracker"
      src={`${SRC}/script.js`}
      strategy="afterInteractive"
      data-website-id={WEBSITE_ID}
      data-domains={DOMAINS}
      data-do-not-track="true"
      data-performance="true"
      data-before-send="__umamiBeforeSend"
      onLoad={flushQueue}
    />
  );
}
