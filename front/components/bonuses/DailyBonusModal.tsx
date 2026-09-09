'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, Flame, X } from 'lucide-react';

interface DailyBonusModalProps {
  open: boolean;
  onClose: () => void;
  cycle: number[];
  streak: number;
  claimedToday: boolean;
  onClaim: () => Promise<boolean>;
  claiming?: boolean;
}

type ClaimPhase = 'idle' | 'revealing' | 'landed' | 'confirmed' | 'error';

// Арт-иконки дней недели из референса (family-c-daily-rewards)
const DAY_ARTS = ['money-bag', 'cash-stack', 'diamond', 'trophy', 'lucky-symbol', 'gift', 'crown'];

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function DailyBonusModal({
  open,
  onClose,
  cycle,
  streak,
  claimedToday,
  onClaim,
  claiming,
}: DailyBonusModalProps) {
  const [phase, setPhase] = useState<ClaimPhase>('idle');
  const [view, setView] = useState<'main' | 'info'>('main');
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Сброс состояния при открытии
  useEffect(() => {
    if (open) {
      setPhase('idle');
      setView('main');
    }
  }, [open]);

  // Блокировка прокрутки фона
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const style = document.body.style;
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    style.overflow = 'hidden';
    return () => {
      style.position = '';
      style.top = '';
      style.left = '';
      style.right = '';
      style.width = '';
      style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Escape закрывает диалог
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  if (!open) return null;

  const cycleLength = Math.max(1, cycle.length);

  // Индекс следующей награды: после получения — следующий день цикла
  const nextIndex = claimedToday
    ? streak % cycleLength
    : Math.min(cycleLength - 1, Math.max(0, streak - 1));
  const nextAmount = cycle[nextIndex] ?? 0;

  const dayState = (i: number): 'claimed' | 'active' | 'future' => {
    if (claimedToday) return i < streak ? 'claimed' : 'future';
    // Сегодня бонус доступен: активен день max(0, streak - 1) (при нулевой серии — день 1)
    const activeIndex = Math.max(0, streak - 1);
    if (i < activeIndex) return 'claimed';
    if (i === activeIndex) return 'active';
    return 'future';
  };

  const runClaim = async () => {
    if (phase !== 'idle' || claiming) return;
    setPhase('revealing');
    const ok = await onClaim();
    if (!ok) {
      setPhase('error');
      return;
    }
    setPhase('landed');
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setPhase('confirmed'), 560);
  };

  const claimAmount = nextAmount;

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-daily"
      data-web-dialog-size="standard"
      data-web-dialog-mobile="detached"
      data-web-dialog-placement="center"
      data-web-dialog-topmost="true"
      data-close-blocked={phase === 'revealing' ? 'true' : 'false'}
      style={
        {
          '--web-dialog-stack-index': 0,
          '--web-dialog-viewport-height': '100dvh',
          '--web-dialog-viewport-width': '100vw',
          '--web-dialog-viewport-top': '0px',
          '--web-dialog-viewport-left': '0px',
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className="web-dialog_backdrop__hf_yN"
        data-web-dialog-backdrop="true"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        className="web-dialog_panel__ZC8Km"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-bonus-dialog-title"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="daily"
        data-web-dialog-asset-phase="ready"
      >
        <div className="web-dialog_chrome__jivZf" data-web-dialog-chrome="true">
          <button
            type="button"
            className="web-dialog_close__DPjMy"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={phase === 'revealing'}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />
            </svg>
          </button>
        </div>
        <div className="web-dialog_scroll__AcpCy" data-web-dialog-scroll-region="true" tabIndex={0}>
          <h2 id="daily-bonus-dialog-title" className="db-srOnly">
            Ежедневный бонус
          </h2>

          {phase === 'idle' && view === 'main' && (
            <section className="db-webSheet">
              {/* Шапка: тикет + заголовок + серия */}
              <div className="db-head">
                <span className="db-headEmoji" aria-hidden="true">
                  <picture className="db-headTicketArt">
                    <source
                      type="image/avif"
                      srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-header-ticket-640w.avif 640w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-header-ticket-960w.avif 960w"
                      sizes="112px"
                    />
                    <source
                      type="image/webp"
                      srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-header-ticket-640w.webp 640w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-header-ticket-960w.webp 960w"
                      sizes="112px"
                    />
                    <img
                      src="/images/web-hub/v1/modals/family-c-daily-rewards/daily-header-ticket-640w.webp"
                      width={640}
                      height={288}
                      sizes="112px"
                      alt=""
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                </span>
                <h2 className="db-headTitle">Прогресс бонусов</h2>
                <p className="db-headSub">
                  Текущая серия: {streak} {pluralRu(streak, ['день', 'дня', 'дней'])}
                </p>
              </div>

              {/* Степпер 7 дней */}
              <div className="db-stepper" role="region" aria-label="Прогресс ежедневных бонусов" tabIndex={0}>
                {cycle.map((amount, i) => {
                  const state = dayState(i);
                  const art = DAY_ARTS[i] ?? 'gift';
                  return (
                    <div
                      key={i}
                      className="db-dayCol"
                      data-daily-day={i + 1}
                      data-state={state}
                      data-final={i === cycle.length - 1}
                    >
                      <picture className="db-dayArt" aria-hidden="true">
                        <source
                          type="image/avif"
                          srcSet={`/images/web-hub/v1/modals/family-c-daily-rewards/daily-day-0${i + 1}-${art}-240w.avif 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-day-0${i + 1}-${art}-320w.avif 320w`}
                          sizes="48px"
                        />
                        <source
                          type="image/webp"
                          srcSet={`/images/web-hub/v1/modals/family-c-daily-rewards/daily-day-0${i + 1}-${art}-240w.webp 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-day-0${i + 1}-${art}-320w.webp 320w`}
                          sizes="48px"
                        />
                        <img
                          src={`/images/web-hub/v1/modals/family-c-daily-rewards/daily-day-0${i + 1}-${art}-320w.webp`}
                          width={240}
                          height={240}
                          sizes="48px"
                          alt=""
                          loading="eager"
                          decoding="async"
                          draggable={false}
                        />
                      </picture>
                      <span className="db-dayDot">
                        {state === 'claimed' ? <Check aria-hidden="true" /> : i + 1}
                      </span>
                      <span className="db-dayLabel">День {i + 1}</span>
                      <span className="db-dayReward">{formatRub(amount)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Блок серии */}
              <div className="db-streakBlock">
                <span className="db-flameSquare" aria-hidden="true">
                  <picture className="db-streakFlameArt">
                    <source
                      type="image/avif"
                      srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-streak-flame-240w.avif 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-streak-flame-320w.avif 320w"
                      sizes="44px"
                    />
                    <source
                      type="image/webp"
                      srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-streak-flame-240w.webp 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-streak-flame-320w.webp 320w"
                      sizes="44px"
                    />
                    <img
                      src="/images/web-hub/v1/modals/family-c-daily-rewards/daily-streak-flame-320w.webp"
                      width={240}
                      height={240}
                      sizes="44px"
                      alt=""
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                </span>
                <div className="db-streakText">
                  <span className="db-streakLabel">Текущая серия</span>
                  <span className="db-streakValue">
                    {streak} {pluralRu(streak, ['день', 'дня', 'дней'])}
                  </span>
                </div>
                <button
                  type="button"
                  className="db-helpBtn"
                  aria-label="Что такое серия?"
                  onClick={() => setView('info')}
                >
                  <CircleHelp aria-hidden="true" />
                </button>
              </div>

              {/* Следующая награда */}
              <div className="db-nextReward">
                <picture className="db-rewardTokenArt" aria-hidden="true">
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-240w.avif 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.avif 320w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-480w.avif 480w"
                    sizes="72px"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-240w.webp 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.webp 320w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-480w.webp 480w"
                    sizes="72px"
                  />
                  <img
                    src="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.webp"
                    width={320}
                    height={320}
                    sizes="72px"
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                </picture>
                <span className="db-nextLabel">Следующая награда</span>
                <span className="db-nextAmount">{formatRub(nextAmount)}</span>
                <span className="db-nextDay">День {nextIndex + 1}</span>
              </div>

              <button
                type="button"
                className="db-primary"
                onClick={() => void runClaim()}
                disabled={claimedToday || claiming}
              >
                {claimedToday ? 'Сегодня недоступно' : 'Забрать бонус'}
              </button>
              {claimedToday && (
                <p className="db-availabilityHint">
                  Следующая награда станет доступна после обновления дня бонусов.
                </p>
              )}
            </section>
          )}

          {phase === 'idle' && view === 'info' && (
            <section className="db-webSheet">
              <div className="db-infoHead">
                <Flame className="db-infoFlame" aria-hidden="true" />
                <h2 className="db-infoTitle">Серия бонусов</h2>
              </div>
              <p className="db-infoSub">Заходите каждый день — серия растёт, награды увеличиваются.</p>
              <ol className="db-infoList">
                <li className="db-infoItem">
                  <span className="db-infoNum">1</span>
                  <span className="db-infoItemText">
                    <span className="db-infoItemTitle">Забирайте бонус ежедневно</span>
                    <span className="db-infoItemBody">
                      Каждый день серии открывает следующую награду недели.
                    </span>
                  </span>
                </li>
                <li className="db-infoItem">
                  <span className="db-infoNum">2</span>
                  <span className="db-infoItemText">
                    <span className="db-infoItemTitle">Пропустили день — серия сгорит</span>
                    <span className="db-infoItemBody">
                      Серия обнуляется, если не забрать бонус до обновления дня.
                    </span>
                  </span>
                </li>
                <li className="db-infoItem">
                  <span className="db-infoNum">3</span>
                  <span className="db-infoItemText">
                    <span className="db-infoItemTitle">День 7 — максимальная награда</span>
                    <span className="db-infoItemBody">
                      После седьмого дня цикл начинается заново, а серия продолжает расти.
                    </span>
                  </span>
                </li>
              </ol>
              <button
                type="button"
                className="db-claimAdvance"
                onClick={() => setView('main')}
              >
                Назад
              </button>
            </section>
          )}

          {phase !== 'idle' && (
            <section className="db-webSheet">
              <div className="db-claimStage" data-daily-claim-phase={phase}>
                <span className="db-claimPulse" aria-hidden="true" />
                <span className="db-claimSparks" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {phase === 'revealing' ? (
                  <>
                    <span className="db-claimSpinner" aria-hidden="true" />
                    <span className="db-claimStatus">Открываем бонус</span>
                  </>
                ) : (
                  <>
                    <span className="db-claimSeal" aria-hidden="true">
                      {phase === 'error' ? <X aria-hidden="true" /> : <Check aria-hidden="true" />}
                    </span>
                    <span className="db-claimStatus">
                      {phase === 'error' ? 'Не получилось' : 'Бонус получен'}
                    </span>
                    {phase !== 'error' && <span className="db-claimReward">+{formatRub(claimAmount)}</span>}
                    <span className="db-claimMessage">
                      {phase === 'error'
                        ? 'Не удалось получить бонус. Попробуйте ещё раз.'
                        : 'Награда зачислена на баланс.'}
                    </span>
                    {phase === 'confirmed' && (
                      <span className="db-claimActionSlot">
                        <button type="button" className="db-claimAdvance" onClick={onClose}>
                          Отлично
                        </button>
                      </span>
                    )}
                    {phase === 'error' && (
                      <span className="db-claimActionSlot">
                        <button type="button" className="db-claimAdvance" onClick={() => void runClaim()}>
                          Повторить
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
