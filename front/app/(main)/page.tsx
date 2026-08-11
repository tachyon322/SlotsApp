import {
  MessageCircle,
  Gamepad2,
  Sparkles,
  Pickaxe,
  Blocks,
  Bomb,
  Package,
  Rocket,
} from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { HomeActions } from "@/components/HomeActions";
import { WithdrawRequests } from "@/components/WithdrawRequests";
import { ContestBanner } from "@/components/ContestBanner";

const GAMES = [
  {
    title: 'Crash',
    description: 'Успей забрать до взрыва',
    multiplier: 'до 100x',
    online: { initial: 1200, min: 500, max: 1350 },
    icon: Rocket,
    href: '/game/crash',
    gradient: 'from-[rgb(139,92,246)] to-[rgb(109,40,217)]',
  },
  {
    title: 'Слоты',
    description: 'Классические слоты с множителями',
    multiplier: 'до 100x',
    online: { initial: 2000, min: 800, max: 2200 },
    icon: Sparkles,
    href: '/game/slots',
    gradient: 'from-[rgb(63,111,228)] to-[rgb(70,52,196)]',
  },
  {
    title: 'Mines',
    description: 'Найдите алмазы, избегая мин',
    multiplier: 'до 50x',
    online: { initial: 500, min: 300, max: 700 },
    icon: Bomb,
    href: '/game/mines',
    gradient: 'from-[rgb(240,118,60)] to-[rgb(216,58,44)]',
  },
  {
    title: 'Кейсы',
    description: 'Лента кейсов с призами',
    multiplier: 'до 20 000 ₽',
    online: { initial: 1100, min: 450, max: 1400 },
    icon: Package,
    href: '/game/cases',
    gradient: 'from-[rgb(42,166,214)] to-[rgb(36,118,182)]',
  },
  {
    title: 'MineDrop',
    description: 'Ломай блоки и зарабатывай',
    multiplier: 'до 200x',
    online: { initial: 450, min: 250, max: 600 },
    icon: Pickaxe,
    href: '/game/minedrop',
    gradient: 'from-[rgb(52,179,102)] to-[rgb(22,121,74)]',
    fullWidth: true,
  },
  {
    title: 'BlockBlast',
    description: 'Множители за закрытие линий',
    multiplier: 'до 2x',
    online: { initial: 1100, min: 400, max: 1300 },
    icon: Blocks,
    href: '/game/blockblast',
    gradient: 'from-[rgb(32,183,166)] to-[rgb(14,143,134)]',
    fullWidth: true,
  },
];

export default function HomePage() {
  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto transition-all duration-300 max-w-5xl">
        <HomeActions />

        {/* Заявки на вывод */}
        <WithdrawRequests />

        {/* Сетка Доступных Игр */}
        <div className="space-y-md mt-xl">
          {/* Баннер конкурса */}
          <ContestBanner />

          <div className="flex items-center gap-xs">
            <Gamepad2 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Доступные Игры</h2>
          </div>

          {/* Карточки раскладываются в 2 колонки ПОД заголовком */}
          <div className="grid grid-cols-2 gap-xs">
            {GAMES.map((game) => (
              <GameCard key={game.title} {...game} />
            ))}
          </div>
        </div>

        {/* Поддержка */}
        <div className="mt-2xl" id="support">
          <a href="/support" className="block p-card rounded-panel bg-slate-900/40 border border-slate-700/20 hover:border-slate-600/30 transition-all flex items-center gap-md cursor-pointer">
            <div className="p-sm rounded-panel bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-2xs">
                Техническая поддержка
              </h3>
              <p className="text-xs text-slate-400">
                Возникли вопросы? Мы на связи 24/7
              </p>
            </div>
          </a>
        </div>

      </div>
    </main>
  );
}
