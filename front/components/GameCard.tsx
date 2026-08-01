import { LucideIcon, Users, Zap } from 'lucide-react';

interface GameCardProps {
  title: string;
  description: string;
  multiplier: string;
  online: number;
  icon: LucideIcon;
  gradient: string;
  isNew?: boolean;
}

export function GameCard({
  title,
  description,
  multiplier,
  online,
  icon: Icon,
  gradient,
  isNew,
}: GameCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl cursor-pointer group h-32 transition-transform hover:scale-[1.01] w-full">
      {/* Фон с градиентом */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      
      {/* Счетчик онлайн */}
      <div className="absolute top-3 right-3 z-10">
        <div className="inline-flex items-center rounded-lg bg-white/15 backdrop-blur-md border border-white/20 px-2 py-1 gap-1">
          <Users className="h-3 w-3 text-white flex-shrink-0" />
          <span className="text-[10px] font-semibold text-white tabular-nums">{online}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        </div>
      </div>

      {/* Контент карточки */}
      <div className="relative h-full p-5 flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <div className="p-4 rounded-2xl bg-white/20 backdrop-blur-sm shadow-2xl">
            <Icon className="h-10 w-10 text-white" />
          </div>
          <div className="absolute inset-0 rounded-2xl bg-white/10 blur-xl" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-xl font-bold text-white drop-shadow-lg">{title}</h3>
            {isNew && (
              <span className="inline-flex items-center rounded-md border bg-white/20 text-white border-white/30 backdrop-blur-sm text-[10px] px-2 py-0.5 font-semibold">
                Новое
              </span>
            )}
          </div>
          <p className="text-sm text-white/80 mb-2 line-clamp-2">{description}</p>
          <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-white/25 text-white border-white/40 backdrop-blur-sm">
            <Zap className="h-3 w-3 mr-1" />
            {multiplier}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
    </div>
  );
}