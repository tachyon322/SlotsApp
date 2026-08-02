import {
  Target,
  Ticket,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  MessageCircle,
  CalendarDays,
  Gamepad2,
  LayoutDashboard,
  Sparkles,
  Pickaxe,
  Blocks,
  Bomb,
  Coins,
} from "lucide-react";
import { GameCard } from "@/components/GameCard";

const GAMES = [
  {
    title: "Кейсы",
    description: "Лента кейсов с призами",
    multiplier: "до 20 000₽",
    online: 50,
    icon: LayoutDashboard,
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    title: "Слот-Машина",
    description: "Классические слоты с множителями",
    multiplier: "до 100x",
    online: 444,
    icon: Sparkles,
    gradient: "from-blue-600 to-indigo-800",
  },
  {
    title: "MineDrop",
    description: "Ломай блоки и зарабатывай",
    multiplier: "до 200x",
    online: 268,
    icon: Pickaxe,
    gradient: "from-green-600 to-emerald-700",
  },
  {
    title: "Block Blast",
    description: "Множители за закрытие линий",
    multiplier: "до 200x",
    online: 50,
    icon: Blocks,
    gradient: "from-violet-500 to-purple-700",
    isNew: true,
  },
  {
    title: "Mines",
    description: "Найдите алмазы, избегая мин",
    multiplier: "до 50x",
    online: 283,
    icon: Bomb,
    gradient: "from-orange-500 to-red-500",
  },
  {
    title: "Орел или Решка",
    description: "Подбрось монетку",
    multiplier: "до 1.96x",
    online: 50,
    icon: Coins,
    gradient: "from-purple-400 to-indigo-500",
  },
  {
    title: "Стаканчики",
    description: "Угадайте под каким стаканчиком шарик",
    multiplier: "до 2.88x",
    online: 52,
    icon: Gamepad2,
    gradient: "from-yellow-400 via-amber-500 to-orange-500",
  },
  {
    title: "CoinUp",
    description: "Лови монеты",
    multiplier: "до 100x",
    online: 196,
    icon: Coins,
    gradient: "from-orange-400 via-pink-500 to-red-500",
    isNew: true,
  },
];

export default function HomePage() {
  return (
    <main className="px-4 md:px-8 pt-4 md:pt-6 pb-8 w-full">
      <div className="mx-auto transition-all duration-300 max-w-5xl">
        {/* Верхние плашки (Колесо Фортуны и Промокоды) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {/* Колесо Фортуны */}
          <div className="relative rounded-xl cursor-pointer overflow-hidden p-5 bg-gradient-to-r from-cyan-900/90 via-blue-900/90 to-cyan-900/90 border border-cyan-500/20">
            <div className="absolute top-[5px] right-3 text-2xl z-10">🏆</div>
            <div className="relative z-20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white">
                  <Target className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-0.5">
                    Колесо Фортуны
                  </h3>
                  <p className="text-xs text-white/60">
                    Выигрывайте призы каждый день
                  </p>
                </div>
              </div>
              <button className="h-8 rounded-md px-3 text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/30">
                <Target className="h-4 w-4" />
                <span>Крутить</span>
              </button>
            </div>
          </div>

          {/* Промокоды */}
          <div className="relative rounded-xl cursor-pointer overflow-hidden p-5 bg-gradient-to-r from-yellow-700/90 via-amber-700/90 to-yellow-700/90 border border-yellow-500/20">
            <div className="absolute top-[5px] right-3 text-2xl z-10">💳</div>
            <div className="relative z-20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 text-white">
                  <Ticket className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-0.5">
                    Промокоды
                  </h3>
                  <p className="text-xs text-white/60">
                    Активируйте коды для бонусов
                  </p>
                </div>
              </div>
              <button className="h-8 rounded-md px-3 text-xs bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-yellow-500/30">
                <Ticket className="h-4 w-4" />
                <span>Ввести</span>
              </button>
            </div>
          </div>
        </div>

        {/* Быстрые кнопки действия */}
        <div className="flex gap-2 py-4 flex-wrap">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <Gift className="w-4 h-4 text-yellow-400" />
            <span>Промокод</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <ArrowUpRight className="w-4 h-4 text-purple-400" />
            <span>Вывести</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
            <span>Депозит</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <span>Поддержка</span>
          </button>
        </div>

        {/* Баннер Конкурса */}
        <div className="my-3">
          <button className="relative w-full text-left p-4 rounded-2xl overflow-hidden bg-gradient-to-r from-sky-500 to-blue-700 flex items-center justify-between border border-white/10">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🏆</span>
              <div>
                <span className="block font-bold text-white text-base">
                  Конкурс недели
                </span>
                <span className="text-xs text-white/75">
                  Участвуйте в конкурсе и выигрывайте призы
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                <CalendarDays className="h-3 w-3" />
                <span>До 6 августа</span>
              </span>
              <span className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                Открыть
              </span>
            </div>
          </button>
        </div>

        {/* Сетка Доступных Игр */}
        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Доступные Игры</h2>
          </div>

          {/* Карточки раскладываются в 2 колонки ПОД заголовком */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GAMES.map((game) => (
              <GameCard key={game.title} {...game} />
            ))}
          </div>
        </div>

        {/* Поддержка */}
        <div className="mt-8">
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/20 hover:border-slate-600/30 transition-all flex items-center gap-4 cursor-pointer">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-0.5">
                Техническая поддержка
              </h3>
              <p className="text-xs text-slate-400">
                Возникли вопросы? Мы на связи 24/7
              </p>
            </div>
          </div>
        </div>

        {/* Футер */}
        <footer className="border-t mt-8 pt-6 pb-20 px-4 bg-black/40 border-white/10 rounded-t-xl">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6">
            <div className="flex flex-col gap-2.5">
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                О нас
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Правила
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Конфиденциальность
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Ответственная игра
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Партнерская программа
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Поддержка
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                FAQ
              </button>
              <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
                Отзывы
              </button>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5">
            <p className="text-[11px] text-zinc-600">
              © 2025 SWAGA GAMES. Все права защищены.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
