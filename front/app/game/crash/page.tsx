'use client';

import { useState } from 'react';
import { useCrashGame } from '@/hooks/useCrashGame';
import { CrashBoard } from '@/components/crash/CrashBoard';
import { CrashControls } from '@/components/crash/CrashControls';
import { CrashFeed } from '@/components/crash/CrashFeed';
import { CrashHistory } from '@/components/crash/CrashHistory';
import { useUser } from '@/components/UserProvider';

export default function CrashPage() {
  const game = useCrashGame();
  const { user } = useUser();
  const [busy] = useState(false);

  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <div className="crash_layout">
          <div className="crash_side">
            <div className="crash_stage">
              <CrashBoard
                phase={game.state.phase}
                history={game.state.history}
                popups={game.state.popups}
                bettingMsLeft={game.state.bettingMsLeft}
                refs={game.refs}
                live={game.live}
              />
            </div>
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
          </div>
          <div className="crash_feedCol">
            <CrashFeed
              bots={game.state.bots}
              player={game.state.player}
              totalBets={game.state.totalBets}
              userName={user?.name ?? null}
            />
            <CrashHistory history={game.state.roundHistory} />
          </div>
        </div>
      </div>
    </main>
  );
}