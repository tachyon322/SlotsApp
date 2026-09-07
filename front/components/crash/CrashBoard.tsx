'use client';

import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { heat } from '@/lib/crash/engine';
import type { Phase, Popup, CrashLive } from '@/hooks/useCrashGame';
import { CRASH_BETTING_MS } from '@/hooks/useCrashGame';

export interface CrashBoardRefs {
  multiplier: React.MutableRefObject<number>;
  crashPoint: React.MutableRefObject<number>;
  startMs: React.MutableRefObject<number>;
  phase: React.MutableRefObject<Phase>;
}

interface CrashBoardProps {
  phase: Phase;
  history: number[];
  popups: Popup[];
  bettingMsLeft: number;
  playerCashedAt: number | null;
  refs: CrashBoardRefs;
  live: CrashLive;
}

/** Тиры чипов истории как в референсе: low <2, mid <5, high <10, huge ≥10. */
type ChipTier = 'low' | 'mid' | 'high' | 'huge';

function chipTier(m: number): ChipTier {
  if (m < 2) return 'low';
  if (m < 5) return 'mid';
  if (m < 10) return 'high';
  return 'huge';
}

// Геометрия поля графика (как в референсе): отступы в px.
const PLOT = { l: 14, r: 26, t: 22, b: 30 } as const;

/** Цвет кривой по текущему множителю (пороги референса). */
function curveColor(m: number): string {
  if (m < 1.5) return '#51e8ff';
  if (m < 2.5) return '#55d9ff';
  if (m < 4) return '#62b8ff';
  if (m < 8) return '#7f96ff';
  if (m < 20) return '#9c70ff';
  return '#d284ff';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

// Оверлей-множитель вынесен в отдельный memo-компонент: он подписан на «живой»
// множитель через useSyncExternalStore и ререндерится сам, не затрагивая доску,
// историю и попапы (те не меняются каждые кадр полёта).
const CrashMultiplier = memo(function CrashMultiplier({
  phase,
  bettingMsLeft,
  live,
  boardRef,
}: {
  phase: Phase;
  bettingMsLeft: number;
  live: CrashLive;
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const m = useSyncExternalStore(
    live.subscribe,
    live.getSnapshot,
    live.getSnapshot,
  );
  const level = heat(m);

  // data-heat на борде (glow ::after) — императивно, чтобы не ререндерить доску.
  useLayoutEffect(() => {
    if (boardRef.current) boardRef.current.dataset.heat = String(level);
  }, [level, boardRef]);

  if (phase === 'betting') {
    const seconds = Math.max(0, Math.ceil(bettingMsLeft / 1000));
    const pct = Math.max(
      0,
      Math.min(100, Math.round((bettingMsLeft / CRASH_BETTING_MS) * 100)),
    );
    return (
      <div className="cg-pauseBox">
        <span className="cg-pauseLabel">Следующий раунд</span>
        <strong className="cg-pauseSeconds">{seconds}s</strong>
        <span className="cg-pauseTrack">
          <span className="cg-pauseFill" style={{ width: `${pct}%` }} />
        </span>
        <span className="cg-pauseHint">До старта раунда</span>
        <small>Сделайте ставку и приготовьтесь к взлёту</small>
      </div>
    );
  }

  return (
    <>
      <div
        className="cg-multiplier"
        data-heat={level}
        data-dead={phase === 'crashed' ? 'true' : 'false'}
        aria-live="polite"
      >
        {m.toFixed(2)}×
      </div>
      {phase === 'crashed' && <div className="cg-crashLabel">Раунд завершён</div>}
    </>
  );
});

export function CrashBoard({
  phase,
  history,
  popups,
  bettingMsLeft,
  playerCashedAt,
  refs,
  live,
}: CrashBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Отдельный rAF для плавной отрисовки кривой (не зависит от React-стейта).
  // Логика повторяет референс: лог-шкала с плавно «догоняющим» окном
  // (max(2.5, 1.35 × множитель), лерп 6% за кадр) — голова кривой вечно медленно
  // дрейфует вверх-вправо, не упирается в границы и не выходит из поля зрения.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Картинка ракеты для «носа» кривой (в исходнике смотрит ровно вверх).
    const rocketImg = new Image();
    rocketImg.src = '/images/cinematic/v1/rocket-768w.webp';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let w = 0;
    let h = 0;
    let win = 2.5; // «окно» лог-шкалы, догоняет 1.35 × множитель
    let lastPhase: Phase | null = null;
    let exploded = false;
    const particles: Particle[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const ph = refs.phase.current;
      // На краше фиксируем голову на краш-точке (как в референсе).
      const m =
        ph === 'crashed' && refs.crashPoint.current > 0
          ? refs.crashPoint.current
          : refs.multiplier.current;
      const dead = ph === 'crashed';
      const color = curveColor(m);
      const baseX = PLOT.l;
      const baseY = h - PLOT.b;

      if (ph !== lastPhase) {
        if (ph === 'flying') {
          win = 2.5;
          exploded = false;
          particles.length = 0;
        }
        lastPhase = ph;
      }

      ctx.clearRect(0, 0, w, h);

      // Фоновая сетка и базовая линия (как в референсе).
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i += 1) {
        const gy = (h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(w - PLOT.r, baseY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();

      if (ph === 'betting') {
        particles.length = 0;
        raf = requestAnimationFrame(draw);
        return;
      }

      // Голова кривой: лог-шкала, нормированная на догоняющее окно.
      const winTarget = Math.max(2.5, 1.35 * m);
      win += (winTarget - win) * 0.06;
      const frac = Math.max(0, Math.min(1, Math.log(m) / Math.log(win)));
      const hx = baseX + frac * (w - PLOT.l - PLOT.r);
      const hy = baseY - frac * (baseY - PLOT.t);
      // Контрольная точка трамплина: 62% по X, всего 12% по Y — кривая стелется
      // понизу и резко загибается вверх.
      const cx = baseX + (hx - baseX) * 0.62;
      const cy = baseY - (baseY - hy) * 0.12;

      // Кривая-трамплин (квадратичная Безье) + свечение + заливка под дугой.
      const grad = ctx.createLinearGradient(baseX, baseY, hx, hy);
      grad.addColorStop(0, dead ? 'rgba(107, 112, 132, 0.5)' : 'rgba(81, 232, 255, 0.62)');
      grad.addColorStop(1, dead ? '#6b6478' : color);
      if (!reducedMotion && !dead) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 22;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(cx, cy, hx, hy);
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = dead ? 3 : 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(cx, cy, hx, hy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(cx, cy, hx, hy);
      ctx.lineTo(hx, baseY);
      ctx.closePath();
      ctx.fillStyle = dead ? 'rgba(107, 100, 120, 0.06)' : `${color}14`;
      ctx.fill();

      // Ракета на кончике: нос по направлению «контрольная точка → голова».
      if (rocketImg.complete && rocketImg.naturalWidth > 0) {
        const size = Math.min(180, Math.max(86, h * 0.38));
        const rw = size * (rocketImg.naturalWidth / Math.max(1, rocketImg.naturalHeight));
        const ang = Math.atan2(hy - cy, hx - cx);
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(ang + Math.PI / 2);
        ctx.globalAlpha = dead ? 0.3 : 0.96;
        ctx.filter = dead
          ? 'grayscale(0.72) drop-shadow(0 0 10px rgba(156, 112, 255, 0.28))'
          : 'drop-shadow(0 0 13px rgba(81, 232, 255, 0.48))';
        ctx.drawImage(rocketImg, -rw / 2, -(0.68 * size), rw, size);
        ctx.restore();
      }

      // Взрыв в момент краша (однократно): 42 фиолетовые частицы.
      if (dead && !exploded) {
        exploded = true;
        if (!reducedMotion) {
          for (let i = 0; i < 42; i += 1) {
            const ang2 = 2 * Math.PI * (i / 42) + 0.3 * Math.random();
            const sp = 1.5 + 4 * Math.random();
            particles.push({
              x: hx,
              y: hy,
              vx: Math.cos(ang2) * sp,
              vy: Math.sin(ang2) * sp,
              life: 0,
              max: 30 + 30 * Math.random(),
              size: 2 + 3 * Math.random(),
              color: '#9c70ff',
            });
          }
        }
      }

      // Выхлоп за ракетой в полёте.
      if (!dead && ph === 'flying' && !reducedMotion) {
        const n = m < 2 ? 1 : m < 6 ? 2 : 3;
        for (let i = 0; i < n && particles.length < 70; i += 1) {
          particles.push({
            x: hx,
            y: hy,
            vx: -0.6 - 1.4 * Math.random(),
            vy: 0.4 + 1.6 * Math.random(),
            life: 0,
            max: 28 + 26 * Math.random(),
            size: 1.5 + 2.5 * Math.random(),
            color,
          });
        }
      }

      // Пульсирующее свечение головы (точка старта ракеты).
      if (!dead) {
        const r0 = (m >= 8 ? 8 : 6) * (reducedMotion ? 1 : 1 + 0.28 * Math.sin(performance.now() / 110));
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 26;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hx, hy, r0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fffefb';
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(2, 0.42 * r0), 0, Math.PI * 2);
        ctx.fill();
      }

      // Частицы (выхлоп / взрыв).
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [refs]);

  const connectionState =
    phase === 'betting' ? 'pause' : phase === 'flying' ? 'flying' : 'crashed';
  const connectionLabel =
    phase === 'betting'
      ? 'Приём ставок'
      : phase === 'flying'
        ? 'Раунд идёт'
        : 'Раунд завершён';

  return (
    <>
      <header className="cg-identity">
        <span className="cg-identityMark" aria-hidden="true">
          <span />
        </span>
        <span className="cg-identityCopy">
          <span className="cg-eyebrow">LITGAME · МГНОВЕННЫЙ РАУНД</span>
          <span className="cg-title">CRASH</span>
          <span className="cg-subtitle">Успейте забрать ставку до точки сбоя</span>
        </span>
        <span className="cg-connection" data-state={connectionState} role="status">
          <span className="cg-connectionDot" aria-hidden="true" />
          {connectionLabel}
        </span>
      </header>

      <section className="cg-stage" aria-label="Crash" data-phase={phase}>
        <div className="cg-board" data-phase={phase} ref={boardRef}>
          <span className="cg-orb" aria-hidden="true" />
          <picture className="cg-rocket" aria-hidden="true">
            <source srcSet="/images/cinematic/v1/rocket-768w.avif" type="image/avif" />
            <img alt="" src="/images/cinematic/v1/rocket-768w.webp" />
          </picture>
          <div className="cg-history" aria-label="История раундов">
            {history.map((h, i) => (
              <span key={i} className="cg-chip" data-tier={chipTier(h)}>
                {h.toFixed(2)}×
              </span>
            ))}
          </div>
          <div className="cg-scale" aria-hidden="true">
            <span>10×+</span>
            <span>5×</span>
            <span>2×</span>
            <span>1×</span>
          </div>
          <canvas ref={canvasRef} className="cg-canvas" aria-hidden="true" />
          <div className="cg-overlay">
            <CrashMultiplier
              phase={phase}
              bettingMsLeft={bettingMsLeft}
              live={live}
              boardRef={boardRef}
            />
          </div>
          <div className="cg-popups" aria-hidden="true">
            {popups.map((p) => (
              <div key={p.id} className="cg-popup">
                <b>+{p.amount.toLocaleString('ru-RU')} ₽</b>
              </div>
            ))}
          </div>
          {playerCashedAt !== null && phase === 'flying' && (
            <div className="cg-cashedTag">Забрано на {playerCashedAt.toFixed(2)}×</div>
          )}
        </div>
      </section>
    </>
  );
}
