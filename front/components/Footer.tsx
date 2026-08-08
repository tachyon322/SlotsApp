import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t mt-2xl pt-xl pb-20 px-page bg-black/40 border-white/10 rounded-t-panel">
      <div className="grid grid-cols-2 gap-x-2xl gap-y-sm mb-xl">
        <div className="flex flex-col gap-xs">
          <Link href="/about" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            О нас
          </Link>
          <Link href="/rules" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            Правила
          </Link>
          <Link href="/privacy" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            Конфиденциальность
          </Link>
          <Link href="/responsible" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            Ответственная игра
          </Link>
        </div>
        <div className="flex flex-col gap-xs">
          <Link href="/support" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            Поддержка
          </Link>
          <Link href="/faq" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            FAQ
          </Link>
          <a href="https://www.otzoviks.com/" className="text-xs text-zinc-500 hover:text-emerald-400 text-left transition-colors">
            Отзывы
          </a>
        </div>
      </div>
      <div className="pt-md border-t border-white/5">
        <p className="text-[11px] text-zinc-600">
          © 2026 LITGAME GAMES. Все права защищены.
        </p>
      </div>
    </footer>
  );
}
