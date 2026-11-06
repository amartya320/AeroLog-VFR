import React, { useEffect, useRef } from 'react';

interface DiwaliFirecrackersProps {
  active: boolean;
  triggerKey: number;
  darkMode?: boolean;
}

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
  trail: Array<{ x: number; y: number }>;
  burstType: 'chrysanthemum' | 'ring' | 'chakri' | 'anar';
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  color: string;
  size: number;
  gravity: number;
  drag: number;
  flicker: boolean;
  prevX: number;
  prevY: number;
}

const DIWALI_PALETTES = [
  ['#fbbf24', '#f59e0b', '#fef08a', '#f97316'], // Golden Phuljhari & Marigold
  ['#f43f5e', '#fb7185', '#fda4af', '#fbbf24'], // Vermilion & Gold
  ['#38bdf8', '#818cf8', '#c084fc', '#fef08a'], // Peacock Blue & Violet
  ['#34d399', '#10b981', '#fde047', '#fb923c'], // Emerald & Saffron
  ['#f97316', '#ef4444', '#fde047', '#ffffff'], // Classic Anar Fountain Gold
];

export const DiwaliFirecrackers: React.FC<DiwaliFirecrackersProps> = ({
  active,
  triggerKey,
  darkMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const startTime = performance.now();
    // Stop launching new rockets at 8.6s so all sparks finish decaying by 10.0s
    const SPAWN_CUTOFF_MS = 8600;

    const createBurst = (
      x: number,
      y: number,
      burstType: Rocket['burstType'],
      palette: string[]
    ) => {
      const count =
        burstType === 'chrysanthemum'
          ? 64
          : burstType === 'chakri'
          ? 52
          : burstType === 'ring'
          ? 44
          : 56;

      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.08;
        const baseSpeed =
          burstType === 'ring'
            ? 4.2 + (Math.random() - 0.5) * 0.4
            : burstType === 'chakri'
            ? 2.2 + (i % 4) * 1.15
            : 1.5 + Math.random() * 4.8;

        const color = palette[i % palette.length];
        sparks.push({
          x,
          y,
          prevX: x,
          prevY: y,
          vx: Math.cos(angle) * baseSpeed,
          vy: Math.sin(angle) * baseSpeed,
          alpha: 1,
          decay: 0.013 + Math.random() * 0.013,
          color,
          size: 1.6 + Math.random() * 1.6,
          gravity: burstType === 'ring' ? 0.035 : 0.055,
          drag: 0.974,
          flicker: Math.random() > 0.35,
        });
      }

      // Inner golden phuljhari core sparks
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 2.1;
        sparks.push({
          x,
          y,
          prevX: x,
          prevY: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: 0.022 + Math.random() * 0.015,
          color: '#fef08a',
          size: 1.3,
          gravity: 0.03,
          drag: 0.96,
          flicker: true,
        });
      }
    };

    const launchRocket = (customX?: number, customTargetY?: number) => {
      const palette =
        DIWALI_PALETTES[Math.floor(Math.random() * DIWALI_PALETTES.length)];
      const startX = customX ?? width * (0.14 + Math.random() * 0.72);
      const targetY = customTargetY ?? height * (0.12 + Math.random() * 0.36);
      const types: Rocket['burstType'][] = [
        'chrysanthemum',
        'ring',
        'chakri',
        'anar',
      ];
      const burstType = types[Math.floor(Math.random() * types.length)];

      rockets.push({
        x: startX,
        y: height * 0.92,
        vx: (Math.random() - 0.5) * 1.8,
        vy: -(8.8 + Math.random() * 3.2),
        targetY,
        color: palette[0],
        trail: [],
        burstType,
      });
    };

    // Immediate 5-shot celebratory Diwali volley
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const positions = [0.18, 0.34, 0.5, 0.66, 0.82];
    positions.forEach((ratio, idx) => {
      const t = setTimeout(() => {
        const palette = DIWALI_PALETTES[idx % DIWALI_PALETTES.length];
        const bx = width * ratio + (Math.random() - 0.5) * 40;
        const by = height * (0.16 + (idx % 3) * 0.09);
        createBurst(
          bx,
          by,
          idx % 2 === 0 ? 'chrysanthemum' : 'ring',
          palette
        );
      }, idx * 130);
      timers.push(t);
    });

    let lastAutoLaunch = startTime;

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = darkMode ? 'lighter' : 'source-over';

      // Launch follow-up sky-shots only within the 3.7s window of the 5-second Easter egg
      if (elapsed < SPAWN_CUTOFF_MS && now - lastAutoLaunch > 550 && rockets.length < 5) {
        launchRocket();
        if (Math.random() > 0.45) {
          launchRocket();
        }
        lastAutoLaunch = now;
      }

      // Update & draw rising rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 10) r.trail.shift();

        r.x += r.vx;
        r.y += r.vy;
        r.vy *= 0.985;

        for (let t = 0; t < r.trail.length; t++) {
          const pt = r.trail[t];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5 * (t / r.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${(t / r.trail.length) * 0.75})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#fef08a';
        ctx.fill();

        if (r.y <= r.targetY || r.vy >= -1.8) {
          const palette =
            DIWALI_PALETTES[Math.floor(Math.random() * DIWALI_PALETTES.length)];
          createBurst(r.x, r.y, r.burstType, palette);
          rockets.splice(i, 1);
        }
      }

      // Update & draw burst sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.prevX = s.x;
        s.prevY = s.y;
        s.vx *= s.drag;
        s.vy = s.vy * s.drag + s.gravity;
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= s.decay;

        if (s.alpha <= 0.02) {
          sparks.splice(i, 1);
          continue;
        }

        const displayAlpha =
          s.flicker && Math.random() > 0.72 ? s.alpha * 0.45 : s.alpha;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, displayAlpha));
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.prevX, s.prevY);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();

        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [active, triggerKey, darkMode]);

  if (!active) return null;

  return (
    <canvas
      id="diwali-firecrackers-canvas"
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50 no-print"
    />
  );
};
