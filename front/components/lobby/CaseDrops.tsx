import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DROPS_DEFINITION } from '@/components/cases/drops';

// Градиент бейджа шанса по редкости (из макета)
const RARITY_BADGE: Record<string, string> = {
  mythic: 'linear-gradient(0deg,#FF9BEA,#C77DFF)',
  legendary: 'linear-gradient(0deg,#FFE29A,#FFB547)',
  epic: 'linear-gradient(0deg,#D7B8FF,#A970FF)',
  uncommon: 'linear-gradient(0deg,#A6E6FF,#4CC3F5)',
  common: 'linear-gradient(0deg,#E1E7F2,#9AA6BB)',
};

interface RarityGroup {
  rarity: string;
  name: string;
  color: string;
  mult: string;
  chance: string;
}

/** Таблица дропов, сведённая по редкости: у «Обычного» две строки (×0.4 и ×0.2) → одна карточка. */
function groupDrops(): RarityGroup[] {
  const groups = new Map<string, { rows: typeof DROPS_DEFINITION }>();
  for (const row of DROPS_DEFINITION) {
    const group = groups.get(row.rarity) ?? { rows: [] };
    group.rows.push(row);
    groups.set(row.rarity, group);
  }

  return [...groups.entries()].map(([rarity, { rows }]) => {
    const factors = rows.map((r) => r.multFactor);
    const lo = Math.floor(Math.min(...factors) * 10) / 10;
    const hi = Math.floor(Math.max(...factors) * 10) / 10;
    const chance = rows.reduce((sum, r) => sum + parseFloat(r.chanceText), 0);
    return {
      rarity,
      name: rows[0].rarityName,
      color: rows[0].rarityColor,
      mult: rows.length === 1 ? rows[0].multText : `×${lo}–${hi}`,
      chance: `${+chance.toFixed(2)}%`,
    };
  });
}

// Витрина «Что падает в кейсах»: данные те же, что и у модалки «Содержимое» (cases/drops.ts)
export function CaseDrops() {
  const groups = groupDrops();

  return (
    <section className="lg-sec" id="cases" aria-labelledby="lg-cases-title">
      <h2 className="lg-sec-title" id="lg-cases-title">
        Что падает в кейсах
        <small>Множитель от ставки и шанс выпадения</small>
      </h2>
      <div className="lg-cases">
        {groups.map((group) => (
          <Link
            key={group.rarity}
            className="lg-case"
            href="/game/cases"
            style={
              {
                '--lg-rc': group.color,
                '--lg-rg': RARITY_BADGE[group.rarity],
                '--lg-rs': group.color.replace('rgb(', 'rgba(').replace(')', ', 0.4)'),
              } as React.CSSProperties
            }
          >
            <span className="lg-chance">
              <span className="lg-tag lg-chance-tag">{group.chance}</span>
            </span>
            <Image width={240} height={240} alt="" src={`/lg/img/cases-${group.rarity}.webp`} loading="lazy" />
            <span className="lg-name">{group.name}</span>
            <span className="lg-price">
              <span className="lg-num">{group.mult}</span>
              <span className="lg-open">Открыть</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="lg-cases-foot">
        <Link className="lg-btn lg-btn-sec" href="/game/cases">
          Открыть кейсы <ArrowRight className="lg-i" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
