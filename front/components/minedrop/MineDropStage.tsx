'use client';

import { BLOCK_IMAGE, BLOCK_PRICE, FIELD_LAYOUT, FIELD_ROWS, TOOL_BY_ID } from '@/lib/minedrop/engine';
import type { Phase, ReelState } from '@/hooks/useMinedropGame';

interface MineDropStageProps {
  phase: Phase;
  reels: string[][];
  reelState: ReelState[];
  destroyed: number[];
  jackpots: boolean[];
  payout: number;
  betAmount: number;
  multiplier: number;
  outcome: 'win' | 'loss' | null;
}

function toolNode(toolId: string, key: string, falling: boolean) {
  if (toolId === 'empty') {
    return (
      <span key={key} className="md-slotMark md-slotMark--empty" aria-hidden="true">
        ✕
      </span>
    );
  }
  const tool = TOOL_BY_ID[toolId];
  if (!tool) return <span key={key} className="md-slotMark" aria-hidden="true" />;
  return (
    <img
      key={key}
      alt=""
      className={`md-toolImg${tool.eye ? ' md-toolImg--eye' : ''}${falling ? ' md-toolImg--falling' : ''}`}
      src={tool.image}
    />
  );
}

export function MineDropStage({
  phase,
  reels,
  reelState,
  destroyed,
  jackpots,
  payout,
  betAmount,
  multiplier,
  outcome,
}: MineDropStageProps) {
  const spinning = phase === 'spinning';
  const resolved = phase === 'resolved';

  return (
    <section className="md-stage" aria-label="MineDrop">
      <div className="md-board">
        {/* Рамка с инструментами */}
        <div className="md-frame" role="presentation">
          {reels.map((col, c) => {
            const st = reelState[c];
            const falling = st === 'falling';
            const eye = jackpots[c];
            return (
              <div key={c} className="md-frameCol" data-col={c} data-state={st}>
                {col.map((toolId, r) => (
                  <div key={r} className="md-slot" data-eye={eye ? 'true' : undefined}>
                    {toolNode(toolId, `${c}-${r}`, falling)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Поле с блоками */}
        <div className="md-field" role="presentation">
          {FIELD_LAYOUT[0].map((_, c) => {
            const st = reelState[c];
            const broken = st === 'falling' || st === 'crashed';
            const eye = jackpots[c];
            const destroyedCount = eye ? FIELD_ROWS : destroyed[c];
            return (
              <div key={c} className="md-fieldCol" data-col={c} data-state={st}>
                {FIELD_LAYOUT.map((row, r) => {
                  const block = row[c];
                  const isDestroyed = broken && r < destroyedCount;
                  return (
                    <div
                      key={r}
                      className="md-cell"
                      data-block={block}
                      data-depth={r}
                      data-state={isDestroyed ? 'destroyed' : 'intact'}
                    >
                      <span
                        className={`md-block${isDestroyed ? ' md-block--breaking' : ''}`}
                        style={{ backgroundImage: `url(${BLOCK_IMAGE[block]})` }}
                      />
                      {eye && broken && (
                        <span className="md-lightning" aria-hidden="true">
                          <span className="md-lightningBolt">⚡</span>
                          <span className="md-lightningFlash" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Оверлей во время спина */}
        <div
          className="md-overlay"
          aria-hidden="true"
          data-visible={spinning ? 'true' : undefined}
        />
      </div>

      {/* Бейдж результата */}
      {resolved && (
        <div className="md-result" data-outcome={outcome ?? 'loss'}>
          <span className="md-resultLabel">
            {outcome === 'win' ? 'Выигрыш' : 'Раунд сыгран'}
          </span>
          <span className="md-resultMultiplier">×{multiplier.toFixed(2)}</span>
          <span className="md-resultAmount">
            {outcome === 'win' ? '+' : ''}
            {payout.toLocaleString('ru-RU')} ₽
          </span>
          <span className="md-resultBet">ставка {betAmount.toLocaleString('ru-RU')} ₽</span>
        </div>
      )}

      <p className="md-legend" aria-hidden="true">
        Стоимость блока: {BLOCK_PRICE.grass} ₽ · {BLOCK_PRICE.coal} ₽ · {BLOCK_PRICE.iron} ₽ ·{' '}
        {BLOCK_PRICE.gold} ₽ · {BLOCK_PRICE.diamond} ₽ · сундук — джекпот
      </p>
    </section>
  );
}
