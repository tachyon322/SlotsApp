'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Headphones } from 'lucide-react';

interface NavItemDef {
  label: string;
  href: string;
  /** Имя картинки в /lg/img (без расширения); у «Поддержки» её нет — вместо неё иконка */
  obj?: string;
  /** Совпадение только по точному пути (иначе — и по вложенным) */
  exact?: boolean;
  badge?: number;
}

const GAMES: NavItemDef[] = [
  { label: 'Crash', href: '/game/crash', obj: 'obj-crash' },
  { label: 'Слоты', href: '/game/slots', obj: 'obj-slots' },
  { label: 'Mines', href: '/game/mines', obj: 'obj-mines' },
  { label: 'Кейсы', href: '/game/cases', obj: 'obj-cases' },
  { label: 'Mine Drop', href: '/game/minedrop', obj: 'obj-minedrop' },
  { label: 'Block Blast', href: '/game/blockblast', obj: 'obj-blockblast' },
];

const LINKS: NavItemDef[] = [
  { label: 'Бонусы', href: '/bonuses', obj: 'obj-bonus', exact: true },
  { label: 'Достижения', href: '/bonuses/achievements', obj: 'obj-trophy' },
  { label: 'Кошелёк', href: '/wallet', obj: 'obj-wallet' },
  { label: 'Поддержка', href: '/support', badge: 1 },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}

// Левый навбар (десктоп ≥1200px): игры и разделы крупными иконками
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="lg-nav" aria-label="Навигация LITGAME">
      <Link className="lg-nav-brand" href="/" aria-label="LITGAME — лобби">
        <Image width={34} height={34} alt="" src="/lg/img/brand-mark.svg" priority />
      </Link>

      <nav className="lg-nav-scroll" aria-label="Игры и разделы">
        {GAMES.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              className="lg-nav-item lg-hv"
              href={item.href}
              data-active={active}
              aria-current={active ? 'page' : undefined}
            >
              <Image width={48} height={48} alt="" src={`/lg/img/${item.obj}.webp`} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <span className="lg-nav-sep" aria-hidden="true" />

        {LINKS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              className="lg-nav-item lg-small lg-hv"
              href={item.href}
              data-active={active}
              aria-current={active ? 'page' : undefined}
            >
              {item.obj ? (
                <Image width={36} height={36} alt="" src={`/lg/img/${item.obj}.webp`} />
              ) : (
                <span className="lg-ic">
                  <Headphones className="lg-i" aria-hidden="true" />
                </span>
              )}
              <span>{item.label}</span>
              {item.badge ? <i className="lg-badge-count">{item.badge}</i> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
