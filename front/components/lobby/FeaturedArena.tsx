'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useDrift, formatRu, formatCompact } from './useOnline';

interface HeroSlide {
  id: string;
  title: string;
  description: string;
  art: string;
  artData: string;
  artWidth: number;
  artHeight: number;
  online: { initial: number; min: number; max: number };
  bet: string;
  href: string;
  badge?: string;
}

const SLIDES: HeroSlide[] = [
  {
    id: 'crash',
    title: 'Crash',
    description: 'Заберите выигрыш до остановки множителя.',
    art: '/newVisual/crash-hero-wide-960w.webp',
    artData: 'crash-hero',
    artWidth: 960,
    artHeight: 540,
    online: { initial: 1127, min: 900, max: 1400 },
    bet: 'Ставка от 10 ₽',
    href: '/game/crash',
  },
  {
    id: 'blockblast',
    title: 'BlockBlast',
    description: 'Множители за закрытие линий.',
    art: '/newVisual/blockblast-cover-640w.webp',
    artData: 'blockblast-cover',
    artWidth: 640,
    artHeight: 800,
    online: { initial: 270, min: 200, max: 420 },
    bet: 'Ставка от 10 ₽',
    href: '/game/blockblast',
    badge: 'Новое',
  },
  {
    id: 'minedrop',
    title: 'MineDrop',
    description: 'Ломай блоки и зарабатывай.',
    art: '/newVisual/minedrop-cover-640w.webp',
    artData: 'minedrop-cover',
    artWidth: 640,
    artHeight: 800,
    online: { initial: 437, min: 300, max: 620 },
    bet: 'Ставка от 10 ₽',
    href: '/game/minedrop',
  },
];

const PREVIEWS = [
  { id: 'blockblast', title: 'BlockBlast', href: '/game/blockblast', art: '/newVisual/blockblast-cover-640w.webp', online: { initial: 270, min: 200, max: 420 }, badge: 'Новое' },
  { id: 'minedrop', title: 'MineDrop', href: '/game/minedrop', art: '/newVisual/minedrop-cover-640w.webp', online: { initial: 437, min: 300, max: 620 } },
  { id: 'slots', title: 'Слоты', href: '/game/slots', art: null, online: { initial: 1669, min: 1200, max: 2000 } },
];

function SlideOnline({ online }: { online: { initial: number; min: number; max: number } }) {
  const value = useDrift(online.initial, online.min, online.max, 3200);

  return (
    <span className="ref-online">
      <span className="ref-onlineDot" aria-hidden="true" />
      <span className="ref-onlineExact">{formatRu(value)} <span>онлайн</span></span>
      <span className="ref-onlineMobile">{formatCompact(value)}</span>
    </span>
  );
}

export function FeaturedArena() {
  const [index, setIndex] = useState(0);

  const move = (delta: number) => {
    setIndex((current) => (current + delta + SLIDES.length) % SLIDES.length);
  };

  const slide = SLIDES[index];

  return (
    <section className="ref-featured" aria-labelledby="ref-featured-title">
      <h2 id="ref-featured-title" className="ref-featuredTitle">
        <span aria-hidden="true">✦</span> Главная игра
      </h2>

      <div className="ref-featuredGrid">
        <article className="ref-hero" data-game={slide.id}>
          <div className="ref-heroSlides">
            {SLIDES.map((item, i) => (
              <div
                key={item.id}
                className="ref-heroSlide"
                data-game={item.id}
                data-state={i === index ? 'current' : 'idle'}
                aria-hidden={i === index ? undefined : 'true'}
              >
                <span className="ref-heroArt" aria-hidden="true">
                  <Image
                    data-art={item.artData}
                    width={item.artWidth}
                    height={item.artHeight}
                    alt=""
                    src={item.art}
                    priority={i === 0}
                    sizes="(max-width: 767px) calc(100vw - 26px), min(calc(70vw - 140px), 1114px)"
                  />
                </span>
                <div className="ref-heroContent">
                  <h3 className="ref-heroTitle">{item.title}</h3>
                  <p className="ref-heroDescription">{item.description}</p>
                  <div className="ref-heroMetadata" aria-label="Параметры игры">
                    <SlideOnline online={item.online} />
                    <span className="ref-minBet">{item.bet}</span>
                  </div>
                  <Link className="ref-cta" href={item.href}>
                    Играть
                    <Play aria-hidden="true" fill="currentColor" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="ref-heroArrows" role="group" aria-label="Переключить главную игру">
            <button type="button" aria-label="Предыдущая игра" onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" aria-label="Следующая игра" onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </article>

        <div className="ref-previewStack">
          {PREVIEWS.map((preview) => (
            <Link
              key={preview.id}
              className="ref-preview"
              data-game={preview.id}
              href={preview.href}
              aria-label={`Открыть ${preview.title}`}
            >
              {preview.art ? (
                <span className="ref-previewArt" aria-hidden="true">
                  <Image
                    width={640}
                    height={800}
                    alt=""
                    src={preview.art}
                    sizes="(max-width: 767px) 30vw, 640px"
                  />
                </span>
              ) : null}
              {preview.badge ? <span className="ref-newBadge">{preview.badge}</span> : null}
              <span className="ref-previewCopy">
                <strong>{preview.title}</strong>
                <SlideOnline online={preview.online} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="ref-pagination" role="group" aria-label="Главные игры">
        {SLIDES.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.title}
            aria-current={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  );
}
