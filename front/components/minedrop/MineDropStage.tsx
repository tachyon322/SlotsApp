'use client';

import { useEffect, useRef } from 'react';
import { BLOCK_COLOR, BLOCK_IMAGE, formatRub } from '@/lib/minedrop/engine';
import {
  BLOCKS,
  COLS,
  SPAWN_Y,
  TICK_HZ,
  TOOLS,
  simulateRound,
  type BlockId,
  type PickaxeEvent,
  type PickaxeRound,
  type ToolDef,
} from '@/lib/minedrop/pickaxeEngine';

interface MineDropStageProps {
  round: PickaxeRound | null;
  runKey: number;
  /** ₽ за одну «тысячную ставки» движка (для всплывающих сумм). */
  rubPerUnit: number;
  turbo: boolean;
  onProgress: (totalUnits: number) => void;
  onDone: () => void;
}

// ── Геометрия ─────────────────────────────────────────────────────────
const VIEW_COLS = COLS + 2; // + стенки по бокам
const SKY_ROWS = 3; // небо над травой
const ASPECT = 1.22; // высота / ширина холста
const PREVIEW_SEED = 0x5eed1e;
const ROULETTE_MS = 1100; // крутится выбор инструмента
const END_MS = 900; // пауза после поломки инструмента
const TICK_MS = 1000 / TICK_HZ;

// ── Визуальные эффекты ───────────────────────────────────────────────
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
interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big: boolean;
}
interface Flash {
  x: number;
  y: number;
  life: number;
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Декоративный блок ниже сгенерированной части шахты. */
function fillerBlock(x: number, y: number): BlockId {
  const r = hash2(x, y);
  if (r < 0.18) return 'air';
  if (r < 0.62) return 'stone';
  if (r < 0.74) return 'coal';
  if (r < 0.84) return 'iron';
  if (r < 0.91) return 'redstone';
  if (r < 0.97) return 'gold';
  return 'diamond';
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function MineDropStage({ round, runKey, rubPerUnit, turbo, onProgress, onDone }: MineDropStageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Пропсы, которые читает RAF-цикл, — через ref, чтобы не перезапускать анимацию.
  const live = useRef({ rubPerUnit, turbo, onProgress, onDone });
  live.current = { rubPerUnit, turbo, onProgress, onDone };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── Ассеты ──
    const images = new Map<string, HTMLImageElement>();
    const img = (src: string) => {
      let el = images.get(src);
      if (!el) {
        el = new Image();
        el.src = src;
        images.set(src, el);
      }
      return el;
    };
    const blockImg = (b: BlockId) => {
      const src = BLOCK_IMAGE[b];
      return src ? img(src) : null;
    };
    const bg = img('/img/minecraft/background.webp');
    TOOLS.forEach((t) => img(t.image));

    // ── Состояние сцены ──
    const playing = round !== null && runKey > 0;
    const source = playing ? round! : simulateRound(PREVIEW_SEED);
    const grid: BlockId[][] = source.grid.map((r) => r.slice());
    const hp: number[][] = grid.map((r) => r.map((b) => BLOCKS[b].hp));
    // Траектория нужна для анимации; если раунд пришёл без неё — досчитываем.
    const replay = playing ? (round!.path ? round! : simulateRound(round!.seed, true)) : null;
    const path = replay?.path ?? [];
    const events: PickaxeEvent[] = replay?.events ?? [];
    const totalTicks = replay?.ticks ?? 0;

    let clock = 0; // мс сцены с начала раунда (турбо ускоряет)
    let evIdx = 0;
    let endAt = -1;
    let pickX = playing ? round!.startX + 0.5 : Math.floor(COLS / 2) + 0.5;
    let pickY = playing ? SPAWN_Y : -1.6;
    let rot = -0.6;
    let durab = playing ? round!.tool.durability : 0;
    const maxDur = playing ? round!.tool.durability : 0;
    let toolShown: ToolDef | null = null;
    let rouletteTool: ToolDef = TOOLS[0];
    let toolVisible = playing;
    let total = 0;
    let camY = -SKY_ROWS;
    let shake = 0;
    let finished = false;
    let deepest = 0;
    const particles: Particle[] = [];
    const floaters: Floater[] = [];
    const flashes: Flash[] = [];

    // ── Размеры ──
    let W = 0;
    let H = 0;
    let cell = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = Math.round(Math.min(W * ASPECT, 640));
      cell = W / VIEW_COLS;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const blockAt = (x: number, y: number): BlockId => {
      if (y < 0) return 'air';
      if (y < grid.length) return grid[y][x];
      return fillerBlock(x, y);
    };

    // ── Эффекты ──
    const burst = (x: number, y: number, color: string, n: number, power = 1) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.8 + Math.random() * 2.6) * power;
        particles.push({
          x: x + 0.5 + (Math.random() - 0.5) * 0.6,
          y: y + 0.5 + (Math.random() - 0.5) * 0.6,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 2.2 * power,
          life: 0,
          max: 0.45 + Math.random() * 0.45,
          size: 0.07 + Math.random() * 0.09,
          color,
        });
      }
    };

    const applyEvent = (e: PickaxeEvent) => {
      if (e.k === 'hit') {
        if (e.y < hp.length) hp[e.y][e.x] = e.hp;
        durab = e.dur;
        if (e.hp > 0) {
          const b = blockAt(e.x, e.y);
          burst(e.x, e.y, BLOCK_COLOR[b] ?? '#999', 3, 0.6);
        }
        shake = Math.max(shake, 0.06);
      } else if (e.k === 'break') {
        grid[e.y][e.x] = 'air';
        hp[e.y][e.x] = 0;
        burst(e.x, e.y, BLOCK_COLOR[e.b], e.b === 'tnt' ? 4 : 14);
        if (e.v > 0) {
          const rub = e.v * live.current.rubPerUnit;
          floaters.push({
            x: e.x + 0.5,
            y: e.y + 0.4,
            text: rub >= 1 ? `+${formatRub(rub)}` : `+${rub.toFixed(2)} ₽`,
            color: e.b === 'chest' ? '#ffd84a' : e.b === 'diamond' ? '#7ff3ff' : '#ffffff',
            life: 0,
            big: e.b === 'chest' || e.b === 'diamond',
          });
          if (e.b === 'chest') {
            burst(e.x, e.y, '#ffd84a', 40, 1.6);
            shake = Math.max(shake, 0.35);
          }
        }
        total = e.total;
        live.current.onProgress(total);
      } else if (e.k === 'boom') {
        flashes.push({ x: e.x + 0.5, y: e.y + 0.5, life: 0 });
        burst(e.x, e.y, '#ffb347', 26, 1.8);
        burst(e.x, e.y, '#555', 12, 1.2);
        shake = Math.max(shake, 0.4);
      } else if (e.k === 'repair') {
        durab = e.dur;
        if (e.amount > 0) {
          floaters.push({ x: pickX, y: pickY - 0.6, text: `+${e.amount} ♥`, color: '#4ade80', life: 0, big: false });
        }
      }
    };

    // ── Шаг анимации ──
    let last = performance.now();
    let raf = 0;

    const step = (dtMs: number) => {
      if (playing && !finished) {
        clock += dtMs * (live.current.turbo ? 2.6 : 1);
        if (clock < ROULETTE_MS) {
          // Крутим инструменты, замедляясь к концу.
          const p = clock / ROULETTE_MS;
          const k = Math.floor(easeOutCubic(p) * 22);
          rouletteTool = p >= 0.92 ? round!.tool : TOOLS[k % TOOLS.length];
          rot = -0.6 + Math.sin(p * Math.PI * 6) * 0.15 * (1 - p);
        } else {
          toolShown = round!.tool;
          // Позиция — линейная интерполяция между тиками записанной физики.
          const ft = Math.min(totalTicks, (clock - ROULETTE_MS) / TICK_MS);
          while (evIdx < events.length && events[evIdx].t <= ft) applyEvent(events[evIdx++]);
          const i = Math.max(0, Math.min(totalTicks - 1, Math.floor(ft)));
          const u = Math.min(1, ft - i);
          const a = i * 3;
          const b = Math.min(path.length - 3, a + 3);
          if (path.length >= 3) {
            pickX = path[a] + (path[b] - path[a]) * u;
            pickY = path[a + 1] + (path[b + 1] - path[a + 1]) * u;
            rot = path[a + 2] + (path[b + 2] - path[a + 2]) * u;
          }
          if (ft >= totalTicks && endAt < 0) {
            // Инструмент сломался — разлетается на куски.
            endAt = clock;
            burst(pickX - 0.5, pickY - 0.5, '#8b6a3e', 18, 1.2);
            burst(pickX - 0.5, pickY - 0.5, '#cfd8dc', 12, 1.2);
            toolVisible = false;
          }
          if (endAt >= 0 && clock - endAt >= END_MS) {
            finished = true;
            live.current.onDone();
          }
        }
      }

      const dt = dtMs / 1000;
      // Частицы
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life += dt;
        q.vy += 9 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.life >= q.max) particles.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.life += dt;
        f.y -= dt * 0.9;
        if (f.life > 1.3) floaters.splice(i, 1);
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life += dt;
        if (flashes[i].life > 0.45) flashes.splice(i, 1);
      }
      shake = Math.max(0, shake - dt * 1.4);

      // Камера держит инструмент на ~38% высоты.
      const viewRows = H / cell;
      const worldY = pickY + SKY_ROWS;
      deepest = Math.max(deepest, Math.floor(pickY));
      const target = Math.max(0, worldY - viewRows * 0.38) - SKY_ROWS;
      camY += (target - camY) * Math.min(1, dt * 6);
    };

    // ── Отрисовка ──
    const drawBlock = (b: BlockId, x: number, y: number, size: number) => {
      const im = blockImg(b);
      if (im && im.complete && im.naturalWidth > 0) {
        ctx.drawImage(im, x, y, size, size);
        return;
      }
      if (b === 'tnt') {
        ctx.fillStyle = '#c6362a';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#8f1f17';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + (i * size) / 4, y, size / 10, size);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(x, y + size * 0.34, size, size * 0.32);
        ctx.fillStyle = '#1b1b1b';
        ctx.font = `900 ${Math.round(size * 0.26)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', x + size / 2, y + size / 2 + 1);
        return;
      }
      if (b === 'repair') {
        ctx.fillStyle = '#c98a3c';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#2fbf55';
        ctx.fillRect(x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.76);
        ctx.fillStyle = '#e9ffe9';
        ctx.beginPath();
        ctx.moveTo(x + size * 0.5, y + size * 0.2);
        ctx.lineTo(x + size * 0.78, y + size * 0.5);
        ctx.lineTo(x + size * 0.6, y + size * 0.5);
        ctx.lineTo(x + size * 0.6, y + size * 0.8);
        ctx.lineTo(x + size * 0.4, y + size * 0.8);
        ctx.lineTo(x + size * 0.4, y + size * 0.5);
        ctx.lineTo(x + size * 0.22, y + size * 0.5);
        ctx.closePath();
        ctx.fill();
        return;
      }
      ctx.fillStyle = BLOCK_COLOR[b];
      ctx.fillRect(x, y, size, size);
    };

    const drawCracks = (x: number, y: number, size: number, dmg: number, seed: number) => {
      const lines = Math.ceil(dmg * 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.beginPath();
      for (let i = 0; i < lines; i++) {
        const a = (seed * 6.28 + i * 1.9) % 6.28;
        const cx = x + size / 2;
        const cy = y + size / 2;
        const mx = cx + Math.cos(a) * size * 0.22;
        const my = cy + Math.sin(a) * size * 0.22;
        ctx.moveTo(cx, cy);
        ctx.lineTo(mx, my);
        ctx.lineTo(mx + Math.cos(a + 0.6) * size * 0.24, my + Math.sin(a + 0.6) * size * 0.24);
      }
      ctx.stroke();
    };

    const draw = (now: number) => {
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * cell * 0.5 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * cell * 0.5 : 0;
      const toScreenY = (wy: number) => (wy - camY) * cell;

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.translate(sx, sy);

      // Фон: небо → пещера.
      if (bg.complete && bg.naturalWidth > 0) {
        const scale = Math.max(W / bg.naturalWidth, H / bg.naturalHeight) * 1.1;
        const bw = bg.naturalWidth * scale;
        const bh = bg.naturalHeight * scale;
        const par = Math.min(bh - H, Math.max(0, (camY + SKY_ROWS) * cell * 0.05));
        ctx.drawImage(bg, (W - bw) / 2, -par, bw, bh);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#8fd0ff');
        g.addColorStop(1, '#d9f0ff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const dark = Math.min(0.62, Math.max(0, camY) / 45);
      if (dark > 0) {
        ctx.fillStyle = `rgba(6, 10, 24, ${dark})`;
        ctx.fillRect(-10, -10, W + 20, H + 20);
      }

      // Блоки и стенки.
      const y0 = Math.floor(camY) - 1;
      const y1 = Math.ceil(camY + H / cell) + 1;
      for (let y = Math.max(0, y0); y <= y1; y++) {
        const py = toScreenY(y);
        // стенки
        for (const wx of [0, VIEW_COLS - 1]) {
          drawBlock('stone', wx * cell, py, cell + 0.5);
          ctx.fillStyle = 'rgba(30, 22, 60, 0.55)';
          ctx.fillRect(wx * cell, py, cell + 0.5, cell + 0.5);
        }
        for (let x = 0; x < COLS; x++) {
          const b = blockAt(x, y);
          if (b === 'air') continue;
          const px = (x + 1) * cell;
          drawBlock(b, px, py, cell + 0.5);
          if (y < hp.length) {
            const maxHp = BLOCKS[b].hp;
            const cur = hp[y][x];
            if (cur > 0 && cur < maxHp) drawCracks(px, py, cell, 1 - cur / maxHp, hash2(x, y));
          }
        }
      }

      // Вспышки TNT.
      for (const f of flashes) {
        const k = f.life / 0.45;
        const r = cell * (0.8 + k * 1.6);
        const gx = (f.x + 1) * cell;
        const gy = toScreenY(f.y);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, `rgba(255, 245, 200, ${0.95 * (1 - k)})`);
        g.addColorStop(0.5, `rgba(255, 150, 40, ${0.7 * (1 - k)})`);
        g.addColorStop(1, 'rgba(255, 80, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Частицы.
      for (const q of particles) {
        ctx.globalAlpha = Math.max(0, 1 - q.life / q.max);
        ctx.fillStyle = q.color;
        const s = q.size * cell;
        ctx.fillRect((q.x + 1) * cell - s / 2, toScreenY(q.y) - s / 2, s, s);
      }
      ctx.globalAlpha = 1;

      // Инструмент.
      const toolForDraw = toolShown ?? (playing ? rouletteTool : null);
      const ix = (pickX + 1) * cell;
      const iy = toScreenY(pickY);
      if (toolVisible && toolForDraw && !finished) {
        const im = img(toolForDraw.image);
        const size = cell * 1.15;
        if (playing && clock < ROULETTE_MS) {
          // Рулетка: подсветка-круг.
          ctx.fillStyle = 'rgba(12, 30, 80, 0.85)';
          ctx.strokeStyle = '#4f8cff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(ix, iy, cell * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        if (im.complete && im.naturalWidth > 0) {
          ctx.save();
          ctx.translate(ix, iy);
          ctx.rotate(rot);
          ctx.drawImage(im, -size / 2, -size / 2, size, size);
          ctx.restore();
        }
        // Прочность над инструментом.
        if (toolShown) {
          const label = `♥ ${durab}/${maxDur}`;
          ctx.font = `800 ${Math.max(11, Math.round(cell * 0.3))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.strokeText(label, ix, iy - cell * 0.95);
          ctx.fillStyle = durab / maxDur < 0.25 ? '#ff7b7b' : '#ffffff';
          ctx.fillText(label, ix, iy - cell * 0.95);
        }
      } else if (!playing) {
        // Превью: инструмент-«?» покачивается над шахтой.
        const bob = Math.sin(now / 400) * 0.12 * cell;
        ctx.fillStyle = 'rgba(12, 30, 80, 0.85)';
        ctx.strokeStyle = '#4f8cff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ix, iy + bob, cell * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.round(cell * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', ix, iy + bob + 2);
      }

      // Всплывающие суммы.
      for (const f of floaters) {
        const a = f.life < 0.9 ? 1 : Math.max(0, 1 - (f.life - 0.9) / 0.4);
        ctx.globalAlpha = a;
        ctx.font = `900 ${Math.round(cell * (f.big ? 0.42 : 0.3))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        const fx = (f.x + 1) * cell;
        const fy = toScreenY(f.y);
        ctx.strokeText(f.text, fx, fy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, fx, fy);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // Глубина.
      if (playing) {
        ctx.font = `700 ${Math.max(11, Math.round(cell * 0.28))}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${Math.max(0, deepest)} м`, 6, 6);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      step(dt);
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [round, runKey]);

  return (
    <div ref={wrapRef} className="md-canvasWrap">
      <canvas ref={canvasRef} className="md-canvas" aria-label="Шахта MineDrop" role="img" />
    </div>
  );
}
