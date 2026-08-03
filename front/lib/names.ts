export const NAMES: string[] = [
  "lucky_roman", "котик", "Артём Б.", "Anton V.", "Blaze377101", "хомяк42",
  "Артём К.", "Huntertiger", "скуф!", "ХОМЯК!!!", "ПЕЛЬМЕНЬ", "Storm93",
  "draftking", "Макс", "fear_me", "Сашок", "Vortex", "лолик", "sergei_99",
  "Колян", "phantom", "dimon", "Тёма", "sniper_pro", "Hedgehog", "wolf777",
  "Кекс", "MisterX", "Drift", "Золотой", "Bandit", "Котлета", "shadow",
  "Капибара", "flame", "tankist", "leopard", "Сергей77", "Whisky", "noobmaster",
  "Барсик", "fenix", "karamel", "Molotov", "Dusty", "Гена", "sauron", "blazyy",
  "Игорь44", "Karman", "Doyle", "Винни", "Lazer", "Винтаж", "Slayer", "стервец",
  "nikito", "rambo", "tornado", "Штрих", "Hooligan", "кушак", "Vasiliy", "heater",
  "Левый", "Onyx", "squid", "Гром", "toretto", "Pumba", "hooke", "Loki",
  "Sintas", "Zipper", "Maverick", "Пельмень", "Шрам", "CheGuevara", "Atila",
  "BraveHeart", "Jimmy", "Кощей", "Вася", "Polaris", "Kratos", "Летучий", "Boomer",
  "Sniper", "Мясо", "Hawk", "Diamond", "Феникс", "Toast", "Z.Decibel", "Кусок",
  "Derzhi", "Вождь", "Vegas", "kira", "Зорро", "Шмель", "Reaper", "Кобра",
  "G_Tron", "Robbin", "Капрал", "Мertext", "Donut", "Вихрь", "Karma", "Каштан",
  "Morfeus", "ogurec", "STONE", "Jet", "Toretto2", "Суслик", "Bison", "Ленин",
  "Kostya", "Prohort", "Борщ", "Zaraza", "Холодный", "Bobr", "Kurwa", "Snake",
  "Тапок", "Жека", "Pusto", "Vova", "Sly", "Кабан", "Tytka", "Сырник", "Ponchik",
  "Vipe", "Бритва", "Кочан", "Zeus", "Sosed", "Гоша", "Дух", "Boets", "Банан",
  "Ragnar", "Молот", "Wolfy", "Silent", "Shark", "Goblin", "Anubis", "Mistik",
  "CREDO", "Бутч", "Demon", "Vandal", "Кузя", "Капрал.", "Shtil", "Nicho",
  "Iceman", "Тарантино", "Mortis", "Сид", "Чехов", "Toxic", "Vector", "Кобольд",
  "Гарри", "Sephiroth", "Omega", "T-Rex", "Хантер", "Tiger", "Voodoo", "Клык",
  "Алмаз", "Maskit", "Sever", "Грин", "Дикий", "Kupol", "Д TECHNO", "Halk",
  "Пёс", "Тень", "Бизон", "Лорд", "Sarge", "Норд", "Хорек", "Кейсик",
];

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export interface Avatar {
  letter: string;
  color: string;
}

export function avatarFor(name: string): Avatar {
  const h = hashCode(name);
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  // Насыщенный RGB из хеша: две компоненты выше, одна ниже — даст «акварельный» цвет как в макете.
  const r = 49 + ((h >> 0) % 130);
  const g = 49 + ((h >> 8) % 130);
  const b = 49 + ((h >> 16) % 130);
  // понижаем одну компоненту чтобы был контраст (как rgb(155,49,120) в макете)
  const drop = h % 3;
  const rr = drop === 0 ? 49 : r;
  const gg = drop === 1 ? 49 : g;
  const bb = drop === 2 ? 49 : b;
  return { letter, color: `rgb(${rr}, ${gg}, ${bb})` };
}

export function randomNames(count: number, exclude: string[] = []): string[] {
  const pool = NAMES.filter((n) => !exclude.includes(n));
  const picked: string[] = [];
  while (pool.length && picked.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}