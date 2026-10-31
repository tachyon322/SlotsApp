'use client';

import { Zap } from 'lucide-react';
import { LgSheet } from '@/components/ui/LgSheet';
import { useSheetChrome } from '@/components/ui/useSheetChrome';
import { FIELD_LAYOUT, formatMultiplier, formatRub } from '@/lib/minedrop/engine';
import { BLOCK_NAME, type RoundView } from '@/components/minedrop/art';
import { Tool } from '@/components/minedrop/MineDropStage';
import { whenLabel } from '@/components/minedrop/MineDropHistory';

interface MineDropReceiptModalProps {
  round: RoundView | null;
  onClose: () => void;
}

export function MineDropReceiptModal({ round, onClose }: MineDropReceiptModalProps) {
  useSheetChrome(Boolean(round), onClose);
  if (!round) return null;

  const net = round.payout - round.bet;
  const points = round.columns ? round.columns.reduce((s, c) => s + c.points, 0) : null;

  return (
    <LgSheet
      titleId="minedrop-receipt-title"
      title={round.id ? `Раунд #${round.id.slice(0, 8)}` : 'Чек раунда'}
      onClose={onClose}
    >
      <div className="md2-rcpHead">
        <div>
          <small>{round.outcome === 'win' ? 'Выигрыш' : 'Выплата'}</small>
          <b data-tone={round.outcome === 'win' ? 'pos' : undefined}>{formatRub(round.payout)}</b>
          {round.createdAt && <span>{whenLabel(round.createdAt)}</span>}
        </div>
        <em data-tone={net > 0 ? 'pos' : 'neg'}>
          {net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}
        </em>
      </div>

      {round.columns && (
        <div className="md2-rcpCols">
          {round.columns.map((col, c) => (
            <div key={c} data-eye={col.jackpot || undefined}>
              <span className="md2-rcpTools">
                {col.slots.map((id, r) => (
                  <Tool key={r} id={id} className="md2-tool" />
                ))}
              </span>
              <b>{col.jackpot ? <Zap aria-label="Око Эндера" /> : null}+{col.points}</b>
              <small>
                {col.destroyed > 0 ? BLOCK_NAME[FIELD_LAYOUT[col.destroyed - 1][c]] : 'мимо'}
              </small>
            </div>
          ))}
        </div>
      )}

      <div className="ls-kv">
        <div>
          Ставка <b>{formatRub(round.bet)}</b>
        </div>
        {points !== null && (
          <div>
            Очки <b>{points}</b>
          </div>
        )}
        <div>
          Множитель <b>{formatMultiplier(round.multiplier)}</b>
        </div>
        <div>
          Выплата <b data-tone={round.outcome === 'win' ? 'pos' : undefined}>{formatRub(round.payout)}</b>
        </div>
      </div>
      <p className="ls-note">Под колонной — самый глубокий разрушенный блок и очки колонны.</p>
    </LgSheet>
  );
}
