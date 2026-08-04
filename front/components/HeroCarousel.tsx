'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { Plus, Target, Ticket } from 'lucide-react';

interface HeroCarouselProps {
  onDeposit?: () => void;
  onPromo?: () => void;
}

export function HeroCarousel({ onDeposit, onPromo }: HeroCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'start',
      containScroll: 'keepSnaps',
      slidesToScroll: 1,
    },
    [
      Autoplay({
        delay: 5000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    onSelect();
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  return (
    <section aria-label="Акции">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-xs">
          {/* Слайд 1 — Первый депозит */}
          <button
            type="button"
            onClick={onDeposit}
            className="relative flex-[0_0_88%] min-w-0 h-40 sm:h-48 rounded-panel overflow-hidden border border-white/10 text-left cursor-pointer group"
          >
            <img
              src="/img/slider/1.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
            <span className="absolute inset-0 p-md sm:p-card-lg flex flex-col justify-center items-start gap-xs sm:gap-sm">
              <h2 className="inline-flex items-center rounded-pill bg-white/15 border border-white/20 backdrop-blur-sm text-[10px] sm:text-[11px] font-bold text-white px-xs py-2xs tracking-wide uppercase">
                Для новых игроков
              </h2>
              <h2 className="text-xl sm:text-3xl font-extrabold text-white drop-shadow-md leading-tight">
                Первый депозит
              </h2>
              <h2 className="text-xs sm:text-base text-white/80">
                Бонус до <b className="text-white font-bold">x2.5</b>
              </h2>
              <h2 className="hero_ctaShimmer relative inline-flex items-center gap-2xs mt-2xs h-8 sm:h-9 px-sm sm:px-md rounded-button text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600">
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Пополнить
              </h2>
            </span>
          </button>

          {/* Слайд 2 — Колесо Фортуны */}
          <button
            type="button"
            className="relative flex-[0_0_88%] min-w-0 h-40 sm:h-48 rounded-panel overflow-hidden border border-white/10 text-left cursor-pointer group"
          >
            <img
              src="/img/slider/2.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
            <span className="absolute inset-0 p-card-lg flex items-center gap-sm sm:gap-md">
              <span className="shrink-0 p-sm rounded-panel bg-white/10 border border-white/15 backdrop-blur-sm text-cyan-300">
                <Target className="h-7 w-7" />
              </span>
              <span className="flex flex-col gap-2xs min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white drop-shadow-md">
                  Колесо Фортуны
                </h2>
                <span className="text-xs sm:text-sm text-white/75">
                  Выигрывайте призы каждый день
                </span>
              </span>
              <span className="ml-auto flex flex-col items-end gap-xs shrink-0">
                <span className="text-2xl" aria-hidden="true">
                  🏆
                </span>
                <span className="text-[11px] text-white/60 font-semibold">
                  Осталось 2 спина
                </span>
                <h2 className="inline-flex items-center gap-2xs h-9 px-md rounded-button text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600">
                  <Target className="h-4 w-4" />
                  Крутить
                </h2>
              </span>
            </span>
          </button>

          {/* Слайд 3 — Промокоды */}
          <button
            type="button"
            onClick={onPromo}
            className="relative flex-[0_0_88%] min-w-0 h-40 sm:h-48 rounded-panel overflow-hidden border border-white/10 text-left cursor-pointer group"
          >
            <img
              src="/img/slider/3.png?v=3"
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
            <span className="absolute inset-0 p-card-lg flex items-center gap-sm sm:gap-md">
              <span className="shrink-0 p-sm rounded-panel bg-white/10 border border-white/15 backdrop-blur-sm text-yellow-300">
                <Ticket className="h-7 w-7" />
              </span>
              <span className="flex flex-col gap-2xs min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white drop-shadow-md">
                  Промокоды
                </h2>
                <span className="text-xs sm:text-sm text-white/75">
                  Активируйте коды для бонусов
                </span>
              </span>
              <span className="ml-auto flex flex-col items-end gap-xs shrink-0">
                <span className="text-2xl" aria-hidden="true">
                  💳
                </span>
                <h2 className="hero_ctaShimmer relative inline-flex items-center gap-2xs h-9 px-md rounded-button text-xs font-bold text-white bg-gradient-to-r from-yellow-500 to-amber-600">
                  <Ticket className="h-4 w-4" />
                  Ввести
                </h2>
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Доты */}
      <div className="flex justify-center gap-2xs mt-sm" aria-label="Слайды">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => scrollTo(index)}
            data-active={selectedIndex === index}
            aria-label={`Перейти к слайду ${index + 1}`}
            aria-current={selectedIndex === index}
            className="w-2 h-2 rounded-pill transition-all duration-300 bg-white/25 data-[active=true]:w-5 data-[active=true]:bg-white/80"
          />
        ))}
      </div>
    </section>
  );
}
