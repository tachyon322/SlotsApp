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

const GAMES = [
  {
    title: 'Crash',
    description: 'Успей забрать до взрыва',
    multiplier: 'до 100x',
    online: '1.2K',
    icon: Rocket,
    href: '/game/crash',
    gradient: 'from-[rgb(139,92,246)] to-[rgb(109,40,217)]',
  },
  {
    title: 'Слоты',
    description: 'Классические слоты с множителями',
    multiplier: 'до 100x',
    online: '2.0K',
    icon: Sparkles,
    href: '/game/slots',
    gradient: 'from-[rgb(63,111,228)] to-[rgb(70,52,196)]',
  },
  {
    title: 'Mines',
    description: 'Найдите алмазы, избегая мин',
    multiplier: 'до 50x',
    online: '1.4K',
    icon: Bomb,
    href: '/game/mines',
    gradient: 'from-[rgb(240,118,60)] to-[rgb(216,58,44)]',
  },
  {
    title: 'Кейсы',
    description: 'Лента кейсов с призами',
    multiplier: 'до 20 000 ₽',
    online: '1.1K',
    icon: Package,
    href: '/game/cases',
    gradient: 'from-[rgb(42,166,214)] to-[rgb(36,118,182)]',
    isNew: true,
  },
  {
    title: 'MineDrop',
    description: 'Ломай блоки и зарабатывай',
    multiplier: 'до 200x',
    online: '1.4K',
    icon: Pickaxe,
    href: '/game/minedrop',
    gradient: 'from-[rgb(52,179,102)] to-[rgb(22,121,74)]',
    fullWidth: true,
  },
  {
    title: 'BlockBlast',
    description: 'Множители за закрытие линий',
    multiplier: 'до 200x',
    online: '1.1K',
    icon: Blocks,
    href: '/game/blockblast',
    gradient: 'from-[rgb(32,183,166)] to-[rgb(14,143,134)]',
    isNew: true,
    fullWidth: true,
  },
];

export default function HomePage() {
  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto transition-all duration-300 max-w-5xl">
        <HomeActions />

        {/* Сетка Доступных Игр */}
        <div className="space-y-md mt-xl">
          <div className="flex items-center gap-xs">
            <Gamepad2 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Доступные Игры</h2>
          </div>

          {/* Карточки раскладываются в 2 колонки ПОД заголовком */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {GAMES.map((game) => (
              <GameCard key={game.title} {...game} />
            ))}
          </div>
        </div>

        {/* Поддержка */}
        <div className="mt-2xl" id="support">
          <div className="p-card rounded-panel bg-slate-900/40 border border-slate-700/20 hover:border-slate-600/30 transition-all flex items-center gap-md cursor-pointer">
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
          </div>
        </div>

      </div>
    </main>
  );
}
