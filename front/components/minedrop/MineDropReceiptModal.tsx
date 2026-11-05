'use client';

import { LgSheet } from '@/components/ui/LgSheet';
import { useSheetChrome } from '@/components/ui/useSheetChrome';
import { formatMultiplier, formatRub } from '@/lib/minedrop/engine';
import { BLOCKS } from '@/lib/minedrop/pickaxeEngine';
import { BlockIcon, ToolIcon, brokenBlocks, type RoundView } from '@/components/minedrop/art';
import { whenLabel } from '@/components/minedrop/MineDropHistory';

interface MineDropReceiptModalProps {
  round: RoundView | null;
  onClose: () => void;
}

export function MineDropReceiptModal({ round, onClose }: MineDropReceiptModalProps) {
  useSheetChrome(Boolean(round), onClose);
  if (!round) return null;

  const net = round.payout - round.bet;
  const r = round.round;
  const broken = r ? brokenBlocks(r) : [];

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

      {round.tool && (
        <div className="md2-rcpTool">
          <ToolIcon tool={round.tool} />
          <span>
            <b>{round.tool.label}</b>
            <small>
              {r ? `глубина ${r.depth} м · разбито блоков: ${r.blocksBroken}` : `♥ ${round.tool.durability} · урон ${round.tool.power}`}
            </small>
          </span>
        </div>
      )}

      {broken.length > 0 && (
        <ul className="md2-rcpBlocks" aria-label="Разбитые блоки">
          {broken.map(([id, n]) => (
            <li key={id} data-value={BLOCKS[id].value > 0 || undefined}>
              <BlockIcon id={id} />
              <span>{BLOCKS[id].label}</span>
              <b>×{n}</b>
            </li>
          ))}
        </ul>
      )}

      <div className="ls-kv">
        <div>
          Ставка <b>{formatRub(round.bet)}</b>
        </div>
        <div>
          Множитель <b>{formatMultiplier(round.multiplier)}</b>
        </div>
        <div>
          Выплата <b data-tone={round.outcome === 'win' ? 'pos' : undefined}>{formatRub(round.payout)}</b>
        </div>
      </div>
      <p className="ls-note">
        {r
          ? `Раунд восстановлен по seed ${r.seed} тем же движком, что и на сервере.`
          : 'Раунд сыгран в прошлой версии игры — подробности недоступны.'}
      </p>
    </LgSheet>
  );
}
