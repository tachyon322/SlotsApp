'use client';

import Link from 'next/link';
import { Tag, btnPrimary } from '@/components/partner/ui';
import { cn } from '@/lib/utils';

export default function OffersHub() {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="max-w-[42rem] text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">Все офферы</h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Выберите проект для просмотра детальной статистики, управления ссылками и отслеживания конверсий
        </p>
      </div>

      <div className="w-full max-w-[24rem]">
        <div className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/20">
          <div className="relative z-[2] flex flex-col items-stretch gap-4">
            <div className="mt-1 mb-1 flex justify-center">
              <div
                className="relative flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-2xl text-5xl"
                style={{ background: 'linear-gradient(135deg, rgba(89, 235, 250, 0.08), rgba(89, 235, 250, 0.19))' }}
              >
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(145deg, rgba(0, 0, 0, 0.2) 0%, transparent 100%)' }}
                />
                <span className="relative z-[1]">🎰</span>
              </div>
            </div>
            <h4 className="text-center text-lg font-bold text-white">LITGAME</h4>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Tag color="green">Казино</Tag>
            </div>
            <Link href="/partner/stats" className={cn(btnPrimary, 'mt-1 w-full')}>
              Перейти в статистику
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
