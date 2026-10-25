export interface LobbyGame {
  id: string;
  title: string;
  href: string;
  /** Категории фильтра каталога */
  cats: string[];
  /** Онлайн-счётчик: [начальное, мин, макс] */
  online: [number, number, number];
  /** Имя картинки в /lg/img (без расширения) */
  obj: string;
  badge?: string;
}

export const LOBBY_GAMES: LobbyGame[] = [
  { id: 'crash', title: 'Crash', href: '/game/crash', cats: ['fast'], online: [1200, 500, 1350], obj: 'obj-crash' },
  { id: 'slots', title: 'Слоты', href: '/game/slots', cats: ['slots'], online: [2000, 800, 2200], obj: 'obj-slots' },
  { id: 'mines', title: 'Mines', href: '/game/mines', cats: ['fast', 'strategy'], online: [500, 300, 700], obj: 'obj-mines' },
  { id: 'cases', title: 'Кейсы', href: '/game/cases', cats: ['cases'], online: [1100, 450, 1400], obj: 'obj-cases', badge: 'Новое' },
  { id: 'minedrop', title: 'MineDrop', href: '/game/minedrop', cats: ['fast', 'arcade'], online: [450, 250, 600], obj: 'obj-minedrop' },
  { id: 'blockblast', title: 'BlockBlast', href: '/game/blockblast', cats: ['arcade', 'strategy'], online: [1100, 400, 1300], obj: 'obj-blockblast', badge: 'Новое' },
];

export const GAME_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'fast', label: 'Быстрые' },
  { id: 'strategy', label: 'Стратегия' },
  { id: 'arcade', label: 'Аркада' },
  { id: 'slots', label: 'Слоты' },
  { id: 'cases', label: 'Кейсы' },
];
