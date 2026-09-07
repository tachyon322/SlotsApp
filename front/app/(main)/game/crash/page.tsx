'use client';

import { useState } from 'react';
import { useCrashGame } from '@/hooks/useCrashGame';
import { CrashBoard } from '@/components/crash/CrashBoard';
import { CrashControls } from '@/components/crash/CrashControls';
import { CrashFeed } from '@/components/crash/CrashFeed';
import { useUser } from '@/components/UserProvider';

export default function CrashPage() {
  const game = useCrashGame();
  const { user } = useUser();
  const [busy] = useState(false);

  const playerCashedAt =
    game.state.phase === 'flying' && game.state.player?.status === 'cashed'
      ? game.state.player.cashedAt
      : null;

  return (
    <div className="cg-shell" data-variant="crash">
      <div className="cg-breakout">
        <div className="cg-surface">
          <CrashBoard
            phase={game.state.phase}
            history={game.state.history}
            popups={game.state.popups}
            bettingMsLeft={game.state.bettingMsLeft}
            playerCashedAt={playerCashedAt}
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
              } else if (
                game.state.phase === 'betting' &&
                game.state.player?.status === 'pending'
              ) {
                game.actions.cancelBet();
              } else if (game.state.phase === 'betting') {
                game.actions.placeBet();
              }
            }}
            busy={busy}
          />
          <CrashFeed
            bots={game.state.bots}
            player={game.state.player}
            totalBets={game.state.totalBets}
            userName={user?.name ?? null}
          />
        </div>
      </div>
    </div>
  );
}
