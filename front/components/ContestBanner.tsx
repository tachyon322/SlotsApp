'use client';

import { CalendarDays } from 'lucide-react';
import { useContestModal } from '@/components/ContestModal';
import { formatContestDate } from '@/lib/contest';

export function ContestBanner() {
  const { openContest } = useContestModal();

  return (
    <button
      type="button"
      aria-label="Открыть конкурс"
      onClick={openContest}
      className="relative block w-full cursor-pointer p-[2px] h-20 overflow-visible rounded-2xl min-[360px]:h-[84px] min-[390px]:h-[88px] xs:h-24 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background:
          'linear-gradient(135deg, rgba(86, 190, 255, 0.95) 0%, rgba(42, 126, 241, 0.78) 48%, rgba(20, 61, 201, 0.9) 100%)',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-[-6px] z-20 h-[68px] w-[58px] min-[360px]:left-2.5 min-[360px]:top-[-7px] min-[360px]:h-[76px] min-[360px]:w-16 min-[390px]:left-2.5 min-[390px]:top-[-8px] min-[390px]:h-[84px] min-[390px]:w-[72px] xs:top-[-9px] xs:h-[92px] xs:w-[78px]"
      >
        <span className="absolute -translate-x-1/2 rounded-full bg-slate-950/35 blur-[3px] bottom-0 left-[58%] h-1.5 w-9 min-[360px]:h-2 min-[360px]:w-10 min-[390px]:bottom-0.5 min-[390px]:w-11" />
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full -rotate-[15deg] scale-110 object-contain opacity-70 blur-[10px] saturate-150"
          src="/img/contest/cup.png"
        />
        <img
          alt=""
          aria-hidden="true"
          className="relative h-full w-full -rotate-[15deg] object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]"
          src="/img/contest/cup.png"
        />
      </span>

      <span
        className="relative z-10 flex h-full w-full items-center overflow-hidden text-left rounded-[14px] px-3 pr-[108px] min-[360px]:px-4 min-[360px]:pr-[118px] min-[390px]:pr-[128px] xs:pr-[140px]"
        style={{
          background:
            'linear-gradient(90deg, rgb(65, 151, 226) 0%, rgb(8, 39, 141) 100%)',
        }}
      >
        <span className="absolute inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/15 px-2 py-1 font-semibold text-white/90 backdrop-blur-sm right-2 top-2 max-w-[96px] text-[9px] min-[360px]:right-2.5 min-[360px]:top-2.5 min-[360px]:max-w-[104px] min-[360px]:gap-1.5 min-[360px]:text-[10px] min-[390px]:right-3 min-[390px]:top-3 min-[390px]:max-w-[112px]">
          <CalendarDays className="h-2.5 w-2.5 flex-shrink-0 text-white/85 min-[360px]:h-3 min-[360px]:w-3" />
          <span className="truncate">До {formatContestDate()}</span>
        </span>

        <span
          className="absolute rounded-xl p-[2px] bottom-1.5 right-2 min-[360px]:right-2.5 min-[390px]:bottom-2 min-[390px]:right-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(102, 163, 255, 0.92) 0%, rgba(49, 94, 229, 0.78) 100%)',
          }}
        >
          <span
            className="flex items-center rounded-[10px] font-bold text-white shadow-[0_6px_14px_rgba(20,45,150,0.28)] h-6 px-3 text-[10px] min-[360px]:h-7 min-[360px]:px-3.5 min-[360px]:text-[11px] min-[390px]:px-4 min-[390px]:text-xs"
            style={{
              background:
                'linear-gradient(90deg, rgb(50, 114, 245) 0%, rgb(32, 74, 210) 100%)',
            }}
          >
            Открыть
          </span>
        </span>

        <span
          aria-hidden="true"
          className="mr-2 h-[56px] w-[48px] flex-shrink-0 min-[360px]:mr-3 min-[360px]:h-16 min-[360px]:w-[54px] min-[390px]:h-[68px] min-[390px]:w-[58px] xs:h-[74px] xs:w-16"
        />

        <span className="min-w-0">
          <span
            className="block whitespace-nowrap font-bold text-white text-[13px] min-[360px]:text-sm min-[390px]:text-base"
            style={{
              textShadow:
                'rgba(255, 255, 255, 0.45) 0px 0px 10px, rgba(255, 255, 255, 0.25) 0px 1px 4px',
            }}
          >
            Конкурс недели
          </span>
          <span className="mt-1 block font-medium text-white/75 text-[10px] min-[360px]:text-[11px] min-[390px]:text-xs">
            Участвуйте в конкурсе
            <br />
            и выигрывайте призы
          </span>
        </span>
      </span>
    </button>
  );
}
