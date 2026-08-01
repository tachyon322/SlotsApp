import Link from 'next/link';
import { 
  House, 
  Wallet, 
  Gift, 
  LayoutDashboard, 
  Sparkles, 
  Gamepad2, 
  Blocks, 
  Bomb, 
  Coins 
} from 'lucide-react';

export function Sidebar() {
  const menuItems = [
    { title: "Главная", icon: House, href: "/", active: true },
    { title: "Кошелек", icon: Wallet, href: "/wallet" },
    { title: "Бонус", icon: Gift, href: "/bonuses", badge: true },
  ];

  const games = [
    { title: "Кейсы", icon: LayoutDashboard, href: "/games/cases" },
    { title: "Слот-Машина", icon: Sparkles, href: "/games/slots" },
    { title: "MineDrop", icon: Gamepad2, href: "/games/minedrop" },
    { title: "Block Blast", icon: Blocks, href: "/games/block-blast" },
    { title: "Mines", icon: Bomb, href: "/games/mines" },
    { title: "Орел или Решка", icon: Coins, href: "/games/coin-flip" },
    { title: "Стаканчики", icon: Gamepad2, href: "/games/cups" },
    { title: "CoinUp", icon: Coins, href: "/games/coinup" },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border z-40 flex-col">
      {/* Логотип */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Swaga
        </span>
      </div>

      {/* Блок авторизации */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">Войдите, чтобы начать играть</p>
          <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-8 rounded-md px-3 text-xs relative w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white overflow-hidden shadow">
            <span className="absolute inset-0 overflow-hidden rounded-md">
              <span className="absolute inset-0 -translate-x-full animate-[btn-shine_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"></span>
            </span>
            <span className="relative z-10">Регистрация</span>
          </button>
          <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs w-full">
            Вход
          </button>
        </div>
      </div>

      {/* Основная навигация */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.active 
                  ? "bg-sidebar-accent text-sidebar-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.title}</span>
              {item.badge && (
                <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </Link>
          );
        })}

        {/* Заголовок категории Игр */}
        <div className="pt-3 pb-1 px-3">
          <span className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Игры
          </span>
        </div>

        {/* Список Игр */}
        {games.map((game) => {
          const Icon = game.icon;
          return (
            <Link
              key={game.title}
              href={game.href}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span>{game.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1" />
    </aside>
  );
}