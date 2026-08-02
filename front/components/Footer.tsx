export function Footer() {
  return (
    <footer className="border-t mt-8 pt-6 pb-20 px-4 bg-black/40 border-white/10 rounded-t-xl max-w-5xl mx-auto">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6">
        <div className="flex flex-col gap-2.5">
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">О нас</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Правила</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Конфиденциальность</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Ответственная игра</button>
        </div>
        <div className="flex flex-col gap-2.5">
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Партнерская программа</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Поддержка</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">FAQ</button>
          <button className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">Отзывы</button>
        </div>
      </div>
      <div className="pt-4 border-t border-white/5">
        <p className="text-[11px] text-zinc-600">© 2025 SWAGA GAMES. Все права защищены.</p>
      </div>
    </footer>
  );
}