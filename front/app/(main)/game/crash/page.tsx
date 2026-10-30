'use client';

import { useState } from 'react';
import { useCrashGame } from '@/hooks/useCrashGame';
import { CrashBoard } from '@/components/crash/CrashBoard';
import { CrashControls } from '@/components/crash/CrashControls';
import { CrashFeed } from '@/components/crash/CrashFeed';
import { CrashHistory } from '@/components/crash/CrashHistory';
import { useUser } from '@/components/UserProvider';

type SideTab = 'players' | 'mine';

export default function CrashPage() {
  const game = useCrashGame();
  const { user } = useUser();
  const [busy] = useState(false);
  const [tab, setTab] = useState<SideTab>('players');

  return (
    <div className="cr-page" data-phase={game.state.phase}>
      <h1 className="sr-only">Crash</h1>

      <div className="cr-play">
        <div className="cr-main">
          <CrashBoard
            phase={game.state.phase}
            history={game.state.history}
            popups={game.state.popups}
            bettingMsLeft={game.state.bettingMsLeft}
            player={game.state.player}
            refs={game.refs}
            live={game.live}
          />
          <CrashControls
            state={game.state}
            live={game.live}
            onPreset={game.actions.setBetAmount}
            onToggleAuto={game.actions.toggleAuto}
            onStepAuto={game.actions.stepAuto}
            onPrimary={() => {
              if (game.state.phase === 'flying') {
                game.actions.manualCashout();
              } else if (game.state.phase === 'betting' && game.state.player?.status === 'pending') {
                game.actions.cancelBet();
              } else if (game.state.phase === 'betting') {
                game.actions.placeBet();
              }
            }}
            busy={busy}
          />
        </div>

        <section className="cr-side" aria-label="Ставки">
          <div className="cr-seg" role="tablist" aria-label="Ставки">
            <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>
              Игроки <small>{game.state.totalBets}</small>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
              Мои ставки
            </button>
          </div>
          {tab === 'players' ? (
            <CrashFeed
              bots={game.state.bots}
              player={game.state.player}
              totalBets={game.state.totalBets}
              userName={user?.name ?? null}
            />
          ) : (
            <CrashHistory history={game.state.roundHistory} />
          )}
        </section>
      </div>
    </div>
  );
}
