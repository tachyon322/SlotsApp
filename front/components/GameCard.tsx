import Link from 'next/link';
import { LucideIcon, Users, Zap } from 'lucide-react';

interface GameCardProps {
  title: string;
  description: string;
  multiplier: string;
  online: string | number;
  icon: LucideIcon;
  href: string;
  gradient: string;
  isNew?: boolean;
  fullWidth?: boolean;
}

export function GameCard({
  title,
  description,
  multiplier,
  online,
  icon: Icon,
  href,
  gradient,
  isNew,
  fullWidth,
}: GameCardProps) {
  return (
    <Link
      href={href}
      className={`relative overflow-hidden rounded-card cursor-pointer group h-32 w-full transition-all duration-300 hover:scale-[1.01] hover:shadow-xl ${
        fullWidth ? 'col-span-1 md:col-span-2' : 'col-span-1'
      }`}
    >
      {/* Градиент фона */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />

      {/* Счетчик онлайн */}
      <div className="absolute top-sm right-sm z-10">
        <div className="inline-flex items-center rounded-pill bg-black/20 backdrop-blur-md border border-white/20 px-xs py-2xs gap-2xs">
          <Users className="h-3 w-3 text-white flex-shrink-0" />
          <span className="text-[10px] font-semibold text-white tabular-nums">{online}</span>
          <div className="w-1.5 h-1.5 rounded-pill bg-emerald-400" />
        </div>
      </div>

      {/* Основной контент */}
      <div className="relative h-full p-card sm:p-card-lg flex items-center gap-md">
        {/* Иконка */}
        <div className="relative flex-shrink-0">
          <div className="p-sm rounded-card bg-white/20 backdrop-blur-sm shadow-xl">
            <Icon className="h-8 w-8 sm:h-9 sm:w-9 text-white" />
          </div>
          <div className="absolute inset-0 rounded-card bg-white/10 blur-md" />
        </div>

        {/* Тексты */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-xs mb-2xs flex-wrap">
            <h3 className="text-lg sm:text-xl font-bold text-white drop-shadow-md truncate">{title}</h3>
            {isNew && (
              <span className="inline-flex items-center rounded-button border bg-white/20 text-white border-white/30 backdrop-blur-sm text-[10px] px-xs py-2xs font-semibold">
                Новое
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-white/80 mb-xs line-clamp-1">{description}</p>
          
          {/* Множитель */}
          <div className="inline-flex items-center rounded-button border px-xs py-2xs text-xs font-semibold bg-white/20 text-white border-white/30 backdrop-blur-sm">
            <Zap className="h-3 w-3 mr-2xs" />
            {multiplier}
          </div>
        </div>
      </div>

      {/* Подсветка полоски снизу */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </Link>
  );
}
