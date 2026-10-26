'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useContestModal } from '@/components/ContestModal';
import { useDrift, formatRu } from './useOnline';

const AUTOPLAY_MS = 6000;

function Online({ initial, min, max }: { initial: number; min: number; max: number }) {
  const value = useDrift(initial, min, max, 3200);
  return <span className="lg-num">{formatRu(value)}</span>;
}

// Слайдер главной: розыгрыш (открывает модалку конкурса) + две игры
export function HeroSlider() {
  const { openContest } = useContestModal();
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const count = 3;

  const go = useCallback((next: number) => {
    setIndex((next + count) % count);
  }, []);

  // Автопрокрутка: таймер пересоздаётся при любой смене слайда, в том числе ручной
  useEffect(() => {
    const id = window.setTimeout(() => setIndex((current) => (current + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index]);

  const slideProps = (i: number, game: string) => ({
    className: `lg-slide${i === index ? ' lg-on' : ''}`,
    'data-game': game,
    'aria-hidden': i === index ? undefined : true,
  });

  return (
    <div
      className="lg-slider"
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        // на телефоне баннеры листаются нативным свайпом ленты
        if (start == null || window.matchMedia('(max-width:767px)').matches) return;
        const delta = e.changedTouches[0].clientX - start;
        if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
      }}
    >
      <article {...slideProps(0, 'apple')}>
        <div className="lg-slide-art">
          <Image className="lg-cover" width={1790} height={640} alt="" src="/lg/img/apple-giveaway.webp" priority />
        </div>
        <div className="lg-slide-copy">
          <h2>Розыгрыш APPLE</h2>
          <p>
            Разыгрываем iPhone&nbsp;17&nbsp;Pro&nbsp;Max, Apple&nbsp;Watch&nbsp;Ultra, AirPods&nbsp;Pro&nbsp;3
            и&nbsp;500&nbsp;000&nbsp;₽ среди игроков STARX
          </p>
          <button className="lg-btn lg-btn-white" type="button" onClick={openContest}>
            Открыть конкурс <ArrowRight className="lg-i" aria-hidden="true" />
          </button>
        </div>
      </article>

      <article {...slideProps(1, 'blockblast')}>
        <div className="lg-slide-art">
          <Image className="lg-obj" width={320} height={320} alt="" src="/lg/img/obj-blockblast.webp" />
        </div>
        <div className="lg-slide-copy">
          <span className="lg-kicker">
            <span className="lg-tag lg-tag-new">Новое</span>
            <Online initial={270} min={200} max={420} />
            &nbsp;онлайн
          </span>
          <h2>BlockBlast</h2>
          <p>Множители за закрытие линий.</p>
          <div className="lg-slide-meta"><span className="lg-chip">Ставка от 10 ₽</span></div>
          <Link className="lg-btn lg-btn-gold" href="/game/blockblast">
            Играть <ArrowRight className="lg-i" aria-hidden="true" />
          </Link>
        </div>
      </article>

      <article {...slideProps(2, 'minedrop')}>
        <div className="lg-slide-art">
          <Image className="lg-obj" width={320} height={320} alt="" src="/lg/img/obj-minedrop.webp" />
        </div>
        <div className="lg-slide-copy">
          <span className="lg-kicker">
            <span className="lg-dot" />
            <Online initial={437} min={300} max={620} />
            &nbsp;онлайн
          </span>
          <h2>MineDrop</h2>
          <p>Ломай блоки и зарабатывай.</p>
          <div className="lg-slide-meta"><span className="lg-chip">Ставка от 10 ₽</span></div>
          <Link className="lg-btn lg-btn-gold" href="/game/minedrop">
            Играть <ArrowRight className="lg-i" aria-hidden="true" />
          </Link>
        </div>
      </article>

      <div className="lg-slider-nav">
        <div className="lg-dots" role="group" aria-label="Слайды">
          {['Розыгрыш APPLE', 'BlockBlast', 'MineDrop'].map((label, i) => (
            <button key={label} type="button" aria-label={label} aria-current={i === index} onClick={() => go(i)} />
          ))}
        </div>
        <button className="lg-arr" type="button" aria-label="Назад" onClick={() => go(index - 1)}>
          <ChevronLeft className="lg-i" aria-hidden="true" />
        </button>
        <button className="lg-arr" type="button" aria-label="Вперёд" onClick={() => go(index + 1)}>
          <ChevronRight className="lg-i" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
