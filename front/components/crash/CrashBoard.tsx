'use client';

import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { heat } from '@/lib/crash/engine';
import type { Phase, Popup, CrashLive, PlayerBet } from '@/hooks/useCrashGame';
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
  player: PlayerBet | null;
  refs: CrashBoardRefs;
  live: CrashLive;
}

/** Тиры чипов истории: low <2, mid <5, high <10, huge ≥10. */
type ChipTier = 'low' | 'mid' | 'high' | 'huge';

function chipTier(m: number): ChipTier {
  if (m < 2) return 'low';
  if (m < 5) return 'mid';
  if (m < 10) return 'high';
  return 'huge';
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

// Геометрия поля графика: отступы в px.
const PLOT = { l: 16, r: 30, t: 34, b: 26 } as const;

/** Цвет кривой по текущему множителю: белый → золото → оранжевый → розовый. */
function curveColor(m: number): string {
  if (m < 1.5) return '#ffffff';
  if (m < 2.5) return '#fff3d6';
  if (m < 4) return '#ffe4ad';
  if (m < 8) return '#ffd58f';
  if (m < 20) return '#ff9f5a';
  return '#ff79e1';
}

// Спрайт самолёта (лист «Frosted Casino Icon Collection»): нос смотрит вверх-вправо под ~36°,
// якорь — середина фюзеляжа (доли ширины/высоты кадра 416×389).
const PLANE = {
  src: '/lg/img/crash-plane.webp',
  heading: Math.atan2(-195, 265),
  ax: 0.61,
  ay: 0.357,
  ratio: 389 / 416,
  size: (h: number) => Math.min(130, Math.max(78, h * 0.34)),
} as const;

// Отметки шкалы множителя.
const TICKS = [1.2, 1.5, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];

function drawPlane(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  ang: number,
  size: number,
  alpha: number,
) {
  const ph = size * PLANE.ratio;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang - PLANE.heading);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -PLANE.ax * size, -PLANE.ay * ph, size, ph);
  ctx.restore();
}

interface Streak {
  x: number;
  y: number;
  len: number;
  k: number;
  a: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  color: string;
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

// Оверлей-множитель — отдельный memo-компонент: подписан на «живой» множитель
// через useSyncExternalStore и ререндерится сам, не затрагивая доску.
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
  const m = useSyncExternalStore(live.subscribe, live.getSnapshot, live.getSnapshot);
  const level = heat(m);

  // data-heat на доске (свечение) — императивно, чтобы не ререндерить доску.
  useLayoutEffect(() => {
    if (boardRef.current) boardRef.current.dataset.heat = String(level);
  }, [level, boardRef]);

  if (phase === 'betting') {
    const seconds = Math.max(0, Math.ceil(bettingMsLeft / 1000));
    const pct = Math.max(0, Math.min(100, (bettingMsLeft / CRASH_BETTING_MS) * 100));
    return (
      <div className="cr-wait">
        <span>Старт через</span>
        <strong>{seconds} с</strong>
        <i aria-hidden="true">
          <b style={{ width: `${pct}%` }} />
        </i>
        <small>Сделайте ставку до взлёта</small>
      </div>
    );
  }

  return (
    <div className="cr-mult" data-heat={level} data-dead={phase === 'crashed'}>
      {phase === 'crashed' && <span>Улетел на</span>}
      <strong key={phase === 'flying' ? Math.floor(m) : 'x'} aria-live="polite">
        {m.toFixed(2)}×
      </strong>
    </div>
  );
});

function PlayerTag({ phase, player }: { phase: Phase; player: PlayerBet | null }) {
  if (!player) return null;
  if (player.status === 'pending') {
    return (
      <div className="cr-tag" data-state="pending">
        Ставка {formatRub(player.amount)} принята
      </div>
    );
  }
  if (player.status === 'in') {
    return (
      <div className="cr-tag" data-state="in">
        В игре {formatRub(player.amount)}
        {player.autoOn && <small>авто {player.autoTarget.toFixed(2)}×</small>}
      </div>
    );
  }
  if (player.status === 'cashed') {
    const at = player.cashedAt ?? 1;
    return (
      <div className="cr-tag" data-state="cashed">
        Забрано на {at.toFixed(2)}× · +{formatRub(Math.round(player.amount * at))}
      </div>
    );
  }
  if (phase === 'crashed') {
    return (
      <div className="cr-tag" data-state="out">
        Ставка сгорела · −{formatRub(player.amount)}
      </div>
    );
  }
  return null;
}

export function CrashBoard({ phase, history, popups, bettingMsLeft, player, refs, live }: CrashBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Отдельный rAF для плавной отрисовки (не зависит от React-стейта).
  // Кривая: лог-шкала с «догоняющим» окном (max(2.5, 1.35 × множитель), лерп 6% за кадр) —
  // голова кривой не упирается в край. Чтобы на 3×+ не было ощущения «зависания», движение
  // передаёт фон: сетка и штрихи скорости летят навстречу, отметки 1,5× / 2× / 3× … уезжают вниз,
  // самолёт покачивается, на каждом целом множителе — кольцо-вспышка. На краше самолёт улетает.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const plane = new Image();
    plane.src = PLANE.src;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let w = 0;
    let h = 0;
    let win = 2.5; // «окно» лог-шкалы, догоняет 1.35 × множитель
    let lastPhase: Phase | null = null;
    let exploded = false;
    let lastT = performance.now();
    let scroll = 0; // накопленный сдвиг фона, px
    let speed = 0; // текущая скорость фона, px/с
    let lastWhole = 1; // последний пройденный целый множитель
    let flyAway = 0; // секунды с момента краша (улёт самолёта)
    let lastHead = { x: 0, y: 0, ang: PLANE.heading };
    const particles: Particle[] = [];
    const streaks: Streak[] = [];
    const rings: Ring[] = [];

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

    const yOf = (v: number, baseY: number) => baseY - (Math.log(v) / Math.log(win)) * (baseY - PLOT.t);

    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const ph = refs.phase.current;
      // На краше фиксируем голову на краш-точке.
      const m = ph === 'crashed' && refs.crashPoint.current > 0 ? refs.crashPoint.current : refs.multiplier.current;
      const dead = ph === 'crashed';
      const flying = ph === 'flying';
      const color = curveColor(m);
      const baseX = PLOT.l;
      const baseY = h - PLOT.b;

      if (ph !== lastPhase) {
        if (ph === 'flying') {
          win = 2.5;
          exploded = false;
          lastWhole = 1;
          flyAway = 0;
          particles.length = 0;
          rings.length = 0;
        }
        if (ph === 'betting') {
          win = 2.5;
          streaks.length = 0;
        }
        lastPhase = ph;
      }

      // Скорость фона растёт с множителем (а не с приростом — тот на 3×+ падает).
      const targetSpeed = flying && !reducedMotion ? Math.min(520, 70 + 120 * Math.log2(Math.max(1, m))) : 0;
      speed += (targetSpeed - speed) * Math.min(1, dt * (flying ? 2.5 : 1.6));
      scroll += speed * dt;

      // Лёгкая тряска на больших множителях.
      const shake = flying && !reducedMotion && m > 8 ? Math.min(1.6, (m - 8) * 0.08) : 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);

      // Точечная сетка, летящая навстречу (вниз-влево).
      const step = 34;
      const ox = scroll % step;
      const oy = (scroll * 0.55) % step;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      for (let gx = -step + (step - ox); gx < w + step; gx += step) {
        for (let gy = -step + oy; gy < h + step; gy += step) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }

      // Штрихи скорости.
      if (flying && !reducedMotion && m >= 1.15) {
        const want = Math.min(22, Math.round(3 + 4 * Math.log2(m) * 1.6));
        while (streaks.length < want) {
          streaks.push({
            x: w * (0.25 + Math.random() * 0.95),
            y: -20 - Math.random() * h * 0.6,
            len: 30 + Math.random() * 70,
            k: 0.7 + Math.random() * 0.9,
            a: 0.05 + Math.random() * 0.1,
          });
        }
      }
      const dirX = -Math.cos(PLANE.heading);
      const dirY = -Math.sin(PLANE.heading);
      for (let i = streaks.length - 1; i >= 0; i -= 1) {
        const s = streaks[i];
        const v = (speed * 2.2 + 40) * s.k * dt;
        s.x += dirX * v;
        s.y += dirY * v;
        if (s.x < -s.len || s.y > h + s.len) {
          streaks.splice(i, 1);
          continue;
        }
        const g = ctx.createLinearGradient(s.x, s.y, s.x - dirX * s.len, s.y - dirY * s.len);
        g.addColorStop(0, `rgba(255, 255, 255, ${s.a})`);
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - dirX * s.len, s.y - dirY * s.len);
        ctx.stroke();
      }

      // Отметки множителя: при росте окна уезжают вниз — видно, что самолёт продолжает набирать.
      if (!dead) {
        const winTarget0 = Math.max(2.5, 1.35 * m);
        if (ph !== 'betting') win += (winTarget0 - win) * 0.06;
      }
      ctx.font = '800 11px "LG Unbounded", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of TICKS) {
        if (v >= win * 1.02) break;
        const ty = yOf(v, baseY);
        if (ty < PLOT.t - 4 || ty > baseY - 10) continue;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(baseX, ty);
        ctx.lineTo(w - 42, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.fillText(`${v}×`, w - 8, ty);
      }

      // Базовая линия.
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(w - PLOT.r, baseY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (ph === 'betting') {
        particles.length = 0;
        // Самолёт ждёт на старте.
        if (plane.complete && plane.naturalWidth > 0) {
          const bob = reducedMotion ? 0 : Math.sin(now / 420) * 2.5;
          const sz = Math.min(96, h * 0.3);
          drawPlane(ctx, plane, baseX + sz * 0.62, baseY - sz * 0.42 + bob, PLANE.heading - 0.12, sz, 0.55);
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      // Голова кривой: лог-шкала, нормированная на догоняющее окно.
      const frac = Math.max(0, Math.min(1, Math.log(m) / Math.log(win)));
      const hx = baseX + frac * (w - PLOT.l - PLOT.r - 40);
      const hy = baseY - frac * (baseY - PLOT.t);
      // Контрольная точка трамплина: 62% по X, 12% по Y — кривая стелется понизу и загибается вверх.
      const cx = baseX + (hx - baseX) * 0.62;
      const cy = baseY - (baseY - hy) * 0.12;

      // Кривая (квадратичная Безье) + свечение + заливка под дугой.
      const grad = ctx.createLinearGradient(baseX, baseY, hx, hy);
      grad.addColorStop(0, dead ? 'rgba(120, 120, 120, 0.45)' : 'rgba(255, 255, 255, 0.55)');
      grad.addColorStop(1, dead ? '#7a6a6a' : color);
      if (!reducedMotion && !dead) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
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
      // Самолёт держит свой курс ~36° и лишь частично доворачивает по касательной —
      // иначе на крутой кривой он «встаёт на хвост», как ракета.
      const tangent = Math.atan2(hy - cy, hx - cx);
      const ang = PLANE.heading + (tangent - PLANE.heading) * 0.35;
      if (!dead) lastHead = { x: hx, y: hy, ang };

      // Кольцо-вспышка на каждом целом множителе (2×, 3×, …).
      const whole = Math.floor(m);
      if (flying && whole > lastWhole) {
        lastWhole = whole;
        if (whole >= 2 && !reducedMotion) rings.push({ x: hx, y: hy, life: 0, color });
      }
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        const r = rings[i];
        r.life += dt;
        if (r.life > 0.7) {
          rings.splice(i, 1);
          continue;
        }
        const t = r.life / 0.7;
        ctx.globalAlpha = 0.6 * (1 - t);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 10 + t * 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Взрыв в момент краша (однократно) — в точке, откуда улетает самолёт.
      if (dead && !exploded) {
        exploded = true;
        if (!reducedMotion) {
          for (let i = 0; i < 36; i += 1) {
            const ang2 = 2 * Math.PI * (i / 36) + 0.3 * Math.random();
            const sp = 1.5 + 4 * Math.random();
            particles.push({
              x: hx,
              y: hy,
              vx: Math.cos(ang2) * sp,
              vy: Math.sin(ang2) * sp,
              life: 0,
              max: 26 + 26 * Math.random(),
              size: 2 + 3 * Math.random(),
              color: i % 3 === 0 ? '#ffffff' : '#ff8a5a',
            });
          }
        }
      }

      // Выхлоп-облачка за самолётом: гуще и быстрее с ростом множителя.
      if (flying && !reducedMotion) {
        const n = m < 2 ? 1 : m < 5 ? 2 : 3;
        const back = PLANE.size(h) * 0.5;
        const ex = hx - Math.cos(ang) * back;
        const ey = hy - Math.sin(ang) * back;
        for (let i = 0; i < n && particles.length < 90; i += 1) {
          particles.push({
            x: ex + (Math.random() - 0.5) * 6,
            y: ey + (Math.random() - 0.5) * 6,
            // Шлейф сносит потоком назад-вниз (вдоль встречного движения фона).
            vx: dirX * (0.8 + speed / 140) * (0.8 + 0.4 * Math.random()),
            vy: dirY * (0.8 + speed / 140) * (0.8 + 0.4 * Math.random()) + (Math.random() - 0.5) * 0.4,
            life: 0,
            max: 26 + 22 * Math.random(),
            size: 2 + 3 * Math.random(),
            color: i % 2 ? '#ffffff' : color,
          });
        }
      }

      // Частицы (выхлоп / взрыв).
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;
        if (dead) p.vy += 0.06;
        if (p.life >= p.max) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = (1 - p.life / p.max) * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + p.life / p.max), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Самолёт: нос по касательной к кривой, покачивается; на краше — улетает вверх-вправо.
      if (plane.complete && plane.naturalWidth > 0) {
        const size = PLANE.size(h);
        if (dead) {
          flyAway += dt;
          const t = flyAway;
          const dist = 260 * t * t + 160 * t;
          const alpha = Math.max(0, 1 - t / 0.9);
          if (alpha > 0) {
            const a = lastHead.ang - 0.25 * Math.min(1, t * 2);
            drawPlane(ctx, plane, lastHead.x + Math.cos(a) * dist, lastHead.y + Math.sin(a) * dist, a, size, alpha);
          }
        } else {
          const bob = reducedMotion ? 0 : Math.sin(now / 260) * (2 + Math.min(3, m * 0.4));
          const tilt = reducedMotion ? 0 : Math.sin(now / 340) * 0.05;
          drawPlane(ctx, plane, hx, hy + bob, ang + tilt, size, 1);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [refs]);

  const statusLabel = phase === 'betting' ? 'Приём ставок' : phase === 'flying' ? 'Полёт' : 'Раунд завершён';

  return (
    <>
      <div className="cr-strip">
        <div className="cr-chips" aria-label="Прошлые раунды">
          {history.length === 0 ? (
            <span className="cr-chips-empty">Здесь появятся прошлые раунды</span>
          ) : (
            history.map((m, i) => (
              <span key={i} className="cr-chip" data-tier={chipTier(m)}>
                {m.toFixed(2)}×
              </span>
            ))
          )}
        </div>
        <span className="cr-status" data-phase={phase} role="status">
          <i aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <section className="cr-board" data-phase={phase} ref={boardRef} aria-label="Crash">
        <canvas ref={canvasRef} className="cr-canvas" aria-hidden="true" />
        <div className="cr-overlay">
          <CrashMultiplier phase={phase} bettingMsLeft={bettingMsLeft} live={live} boardRef={boardRef} />
        </div>
        <div className="cr-popups" aria-hidden="true">
          {popups.map((p) => (
            <b key={p.id} className="cr-popup">
              +{p.amount.toLocaleString('ru-RU')} ₽
            </b>
          ))}
        </div>
        <PlayerTag phase={phase} player={player} />
      </section>
    </>
  );
}
