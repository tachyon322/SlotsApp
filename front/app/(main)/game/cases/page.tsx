'use client';

import React from 'react';
import { useCasesGame } from '@/hooks/useCasesGame';
import { CasesStage } from '@/components/cases/CasesStage';
import { CasesControls } from '@/components/cases/CasesControls';
import { CasesHistory } from '@/components/cases/CasesHistory';
import { CasesContentsModal } from '@/components/cases/CasesContentsModal';
import { CasesReceiptModal } from '@/components/cases/CasesReceiptModal';

export default function CasesPage() {
  const game = useCasesGame();
  const s = game.state;

  // Мега-занос: подсветка стадии + dim по референсу (множитель ≥ 10).
  const bigWin = s.settled && s.lastMultiplier >= 10;

  return (
    <div className="cs-shell" data-bigwin={bigWin}>
      <div className="cs-content">
        <div className="cs-experience">
          <picture className="cs-environment">
            <source
              srcSet="/images/games/uiux-v2/environment/cosmic-cavern-1536w.avif"
              type="image/avif"
            />
            <img
              alt=""
              aria-hidden="true"
              src="/images/games/uiux-v2/environment/cosmic-cavern-1536w.webp"
            />
          </picture>

          <div className="cs-gameSurface">
            <section className="cs-hero" aria-labelledby="cases-title">
              <div className="cs-heroArtFrame" aria-hidden="true">
                <picture className="cs-heroArtwork">
                  <source
                    srcSet="/images/games/uiux-v2/heroes/game-hero-atlas-1536w.avif"
                    type="image/avif"
                  />
                  <img
                    className="cs-heroAtlas"
                    alt=""
                    fetchPriority="high"
                    src="/images/games/uiux-v2/heroes/game-hero-atlas-1536w.webp"
                  />
                </picture>
              </div>
              <div className="cs-heroCopy">
                <span className="cs-heroKicker">Коллекция наград</span>
                <h1 className="cs-heroTitle" id="cases-title">
                  КЕЙСЫ
                </h1>
                <p className="cs-heroSubtitle">
                  Выберите кейс, откройте до 3 линий и заберите выпавшие награды.
                </p>
                <div className="cs-heroMeta">
                  <span>5 кейсов</span>
                  <span>Линии 1–3</span>
                </div>
              </div>
            </section>

            {/* Stage / Roulette Reels */}
            <CasesStage
              lines={s.activeLines}
              spinning={s.spinning}
              spinId={s.spinId}
              settled={s.settled}
              settledLines={s.settledLines}
              linesData={s.linesData}
              lineBet={s.activeCase.price}
              caseName={s.activeCase.name}
              bigWin={bigWin}
              lastPayout={s.lastPayout}
              lastMultiplier={s.lastMultiplier}
              outcome={s.outcome}
              maxRarity={s.maxRarity}
            />

            {/* Controls & Case Selector */}
            <CasesControls
              activeCaseId={s.activeCaseId}
              activeLines={s.activeLines}
              totalBet={s.totalBet}
              maxPayout={s.maxPayout}
              spinning={s.spinning}
              onSelectCase={game.actions.setActiveCaseId}
              onSelectLines={game.actions.setActiveLines}
              onSpin={() => void game.actions.spin()}
              onOpenContents={() => game.actions.setIsContentsModalOpen(true)}
            />

            {/* Game History */}
            <CasesHistory
              history={s.history}
              stats={s.stats}
              onOpenReceipt={(item) => game.actions.setSelectedReceiptItem(item)}
            />
          </div>
        </div>
      </div>

      {/* Contents Modal */}
      <CasesContentsModal
        open={s.isContentsModalOpen}
        onClose={() => game.actions.setIsContentsModalOpen(false)}
        activeCaseId={s.activeCaseId}
      />

      {/* Receipt Modal */}
      <CasesReceiptModal
        open={Boolean(s.selectedReceiptItem)}
        onClose={() => game.actions.setSelectedReceiptItem(null)}
        item={s.selectedReceiptItem}
      />
    </div>
  );
}
