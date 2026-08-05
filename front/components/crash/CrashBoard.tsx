'use client';

import { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  heat,
  multiplierFromTime,
  tier,
} from '@/lib/crash/engine';
import type { Phase, Popup, CrashLive } from '@/hooks/useCrashGame';

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
  refs: CrashBoardRefs;
  live: CrashLive;
}

const TIER_COLORS: Record<string, string> = {
  low: '#94a3b8',
  mid: '#5c9bff',
  high: '#fb923c',
};

// Фиксированные окна отображения: одинаковый множитель всегда на одной позиции,
// независимо от длины раунда или краш-точки (консистентность между раундами).
const TIME_WINDOW = 20; // секунд видимо по горизонтали
const MULT_WINDOW = 20; // множитель, соответствующий верху канваса
// Камера держит «ракету» на этой доле ширины, когда кривая выходит за правый край.
const FOLLOW = 0.65;

// Оверлей-множитель вынесен в отдельный memo-компонент: он подписан на «живой»
// множитель через useSyncExternalStore и ререндерится сам, не затрагивая доску,
// историю и попапы (те не меняются каждые кадр полёта).
const CrashMultiplier = memo(function CrashMultiplier({
  phase,
  bettingMsLeft,
  live,
}: {
  phase: Phase;
  bettingMsLeft: number;
  live: CrashLive;
}) {
  const m = useSyncExternalStore(
    live.subscribe,
    live.getSnapshot,
    live.getSnapshot,
  );

  if (phase === 'flying') {
    return (
      <div
        className="crash_multiplier"
        data-heat={heat(m)}
        data-dead="false"
        aria-live="polite"
      >
        {m.toFixed(2)}×
      </div>
    );
  }
  if (phase === 'betting') {
    return (
      <div className="crash_multiplier" data-phase="betting">
        Раунд через {Math.ceil(bettingMsLeft / 1000)}с
      </div>
    );
  }
  return (
    <div className="crash_multiplier" data-dead="true">
      {m.toFixed(2)}×
    </div>
  );
});

export function CrashBoard({
  phase,
  history,
  popups,
  bettingMsLeft,
  refs,
  live,
}: CrashBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Отдельный rAF для плавной отрисовки кривой (не зависит от React-стейта).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let frozenElapsed = 0; // фиксирует длину кривой на момент краша

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const padTop = 44; // под полосой истории
      const pad = 18;
      const innerW = w - pad * 2;
      const innerH = h - padTop - pad;

      const now = performance.now();
      const ph = refs.phase.current;
      const m = refs.multiplier.current;

      // Замораживаем длину кривой в момент краша: пока летим — обновляем,
      // как только наступила фаза crashed — сохранённое значение не меняется.
      if (ph === 'flying') {
        frozenElapsed = (now - refs.startMs.current) / 1000;
      }
      const drawElapsed = frozenElapsed;

      // Фиксированные окна: одинаковый множитель всегда на одной позиции.
      const timeWindow = TIME_WINDOW;
      const multWindow = MULT_WINDOW;

      // Камера следует за точкой: пока кривая не вышла за порог, начало у левого
      // края; дальше сдвигаем окно так, чтобы «ракета» держалась на FOLLOW ширины.
      // Масштаб (px за секунду) неизменен → форма/наклон кривой всегда одинаковы.
      const pxPerSec = innerW / timeWindow;
      const cameraLeft = Math.max(0, drawElapsed - FOLLOW * timeWindow);
      const xForT = (t: number) => pad + (t - cameraLeft) * pxPerSec;
      // Y: логарифмическая шкала — дуга резко вверх на первых процентах,
      // затем плавно выходит на насыщение. Клампим в [0,1].
      const yForM = (mm: number) => {
        const safe = Math.max(mm, 1);
        const t = Math.min(Math.log(safe) / Math.log(multWindow), 1);
        return padTop + innerH - t * innerH;
      };

      if (ph === 'flying' || ph === 'crashed') {
        const color = ph === 'crashed' ? '#ef4444' : TIER_COLORS[tier(m)];
        // заливка под кривой
        ctx.beginPath();
        ctx.moveTo(xForT(0), yForM(1));
        const samples = 64;
        for (let i = 1; i <= samples; i++) {
          const t = (drawElapsed * i) / samples;
          const mm = multiplierFromTime(t);
          ctx.lineTo(xForT(t), yForM(mm));
        }
        ctx.lineTo(xForT(drawElapsed), padTop + innerH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padTop, 0, padTop + innerH);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.fill();

        // сама кривая
        ctx.beginPath();
        ctx.moveTo(xForT(0), yForM(1));
        for (let i = 1; i <= samples; i++) {
          const t = (drawElapsed * i) / samples;
          const mm = multiplierFromTime(t);
          ctx.lineTo(xForT(t), yForM(mm));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // «ракета» на конце (фиксирована на краше, т.к. drawElapsed заморожен)
        const hx = xForT(drawElapsed);
        const hy = yForM(m);
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx, hy, 11, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();

        if (ph === 'crashed') {
          ctx.fillStyle = '#ef4444';
          ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
          ctx.fillText('КРАШ', hx + 14, hy - 6);
        }
      } else {
        // betting — статичная стартовая линия, ничего не «идёт во времени»
        ctx.strokeStyle = 'rgba(148,163,184,0.25)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(pad, yForM(1));
        ctx.lineTo(w - pad, yForM(1));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [refs]);

  return (
    <div className="crash_board" data-phase={phase}>
      <div className="crash_historyStrip" aria-label="История раундов">
        {history.map((h, i) => (
          <span key={i} className="crash_chip" data-tier={tier(h)}>
            {h.toFixed(2)}×
          </span>
        ))}
      </div>
      <canvas ref={canvasRef} className="crash_canvas" aria-hidden="true" />
      <div className="crash_overlay">
        <CrashMultiplier phase={phase} bettingMsLeft={bettingMsLeft} live={live} />
      </div>
      <div className="crash_popups">
        {popups.map((p) => (
          <div key={p.id} className="crash_popup">
            +{p.amount.toLocaleString('ru-RU')} ₽
          </div>
        ))}
      </div>
    </div>
  );
}