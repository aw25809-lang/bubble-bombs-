import React, { useEffect, useRef } from 'react';
import { GameState, PourSegment, TurnPhase } from '../types/game';

export interface StageSimulationState {
  gameState: GameState;
  turnPhase: TurnPhase;
  isPouring: boolean;
  waterRatio: number;
  initialRatio: number;
  bottleWidthScale: number;
  minPourProgress: number; // 0..1 for current turn minimum pour
  minPourReached: boolean;
  segments: PourSegment[];
  overflowed: boolean;
  activePlayerColor: string;
  revealProgress: number; // 0 = completely covered, 1 = sleeve peeled open
  shakePower: number;
  hitstopTimer: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'splash' | 'bubble' | 'foam' | 'spark';
}

interface BottleStageCanvasProps {
  simRef: React.MutableRefObject<StageSimulationState>;
  onStagePointerDown?: () => void;
  onStagePointerUp?: () => void;
  interactive: boolean;
}

const PARTICLE_POOL_SIZE = 180;

export const BottleStageCanvas: React.FC<BottleStageCanvasProps> = ({
  simRef,
  onStagePointerDown,
  onStagePointerUp,
  interactive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 2,
      alpha: 1,
      life: 0,
      maxLife: 1,
      color: '#38BDF8',
      kind: 'splash',
    }))
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let valveOpen = 0; // 0..1 smooth lever interpolation
    let streamPhase = 0;
    let idleDripTimer = 1.6;
    let minPulseTimer = 0;
    let prevMinReached = false;
    let prevOverflowed = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
    };

    const spawnParticle = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      radius: number,
      maxLife: number,
      color: string,
      kind: Particle['kind']
    ) => {
      const pool = particlesRef.current;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) {
          p.active = true;
          p.x = x;
          p.y = y;
          p.vx = vx;
          p.vy = vy;
          p.radius = radius;
          p.life = 0;
          p.maxLife = maxLife;
          p.alpha = 1;
          p.color = color;
          p.kind = kind;
          return;
        }
      }
    };

    const triggerOverflowBurst = (cx: number, mouthY: number) => {
      for (let i = 0; i < 65; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
        const speed = 130 + Math.random() * 340;
        const isFoam = i % 3 === 0;
        spawnParticle(
          cx + (Math.random() - 0.5) * 18,
          mouthY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 60,
          isFoam ? 5 + Math.random() * 7 : 2.5 + Math.random() * 4,
          0.65 + Math.random() * 0.75,
          isFoam ? '#F0F9FF' : '#38BDF8',
          isFoam ? 'foam' : 'splash'
        );
      }
    };

    const drawRoundRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

    const frame = (now: number) => {
      resize();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const sim = simRef.current;

      // Hitstop freeze for heavy overflow impact
      if (sim.hitstopTimer > 0) {
        sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
      } else {
        elapsed += dt;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Camera shake decay
      let shakeX = 0;
      let shakeY = 0;
      if (sim.shakePower > 0.2) {
        shakeX = (Math.random() - 0.5) * sim.shakePower;
        shakeY = (Math.random() - 0.5) * sim.shakePower;
        sim.shakePower *= Math.pow(0.04, dt);
      } else {
        sim.shakePower = 0;
      }

      // Smooth reveal interpolation
      if (sim.gameState === 'ROUND_REVEAL' && sim.revealProgress < 1) {
        sim.revealProgress = Math.min(1, sim.revealProgress + dt * 1.85);
      }

      // Smooth valve open/close interpolation
      const targetValve = sim.isPouring ? 1 : 0;
      valveOpen += (targetValve - valveOpen) * Math.min(1, dt * 18);
      streamPhase += dt * 18;

      if (sim.minPourReached && !prevMinReached && sim.isPouring) {
        minPulseTimer = 0.55;
      }
      prevMinReached = sim.minPourReached;
      if (minPulseTimer > 0) minPulseTimer = Math.max(0, minPulseTimer - dt);

      // Layout geometry responsive to mobile & desktop
      const isTitle = sim.gameState === 'TITLE_MENU';
      const bottleCenterX = isTitle && width >= 960 ? width * 0.74 : width * 0.5;
      const faucetY = Math.max(58, height * 0.11);
      const counterY = Math.min(height - 54, height * 0.87);

      const availableSpan = Math.max(220, counterY - faucetY);
      const bottleHeight = Math.min(340, availableSpan * 0.62);
      const bottleWidth = Math.min(148, bottleHeight * 0.42 * (sim.bottleWidthScale || 1));
      const bottleBottomY = counterY - 8;
      const bottleTopY = bottleBottomY - bottleHeight;
      const nozzleY = faucetY + 58;

      // Overflow particle trigger on edge
      if (sim.overflowed && !prevOverflowed) {
        triggerOverflowBurst(bottleCenterX, bottleTopY + 8);
      }
      prevOverflowed = sim.overflowed;

      // Ambient festival lantern sparks
      if (Math.random() < (isTitle ? 0.14 : 0.06)) {
        spawnParticle(
          Math.random() * width,
          height * (0.1 + Math.random() * 0.55),
          (Math.random() - 0.5) * 18,
          -12 - Math.random() * 24,
          1.2 + Math.random() * 1.8,
          1.4 + Math.random() * 1.6,
          Math.random() < 0.5 ? '#FBBF24' : '#FDE68A',
          'spark'
        );
      }

      // Idle title drip
      if (isTitle) {
        idleDripTimer -= dt;
        if (idleDripTimer <= 0) {
          idleDripTimer = 2.0 + Math.random() * 1.4;
          spawnParticle(
            bottleCenterX,
            nozzleY + 4,
            0,
            210,
            3.5,
            0.72,
            '#38BDF8',
            'splash'
          );
        }
      }

      // Active pour stream splash particles at bottle lip
      if (sim.isPouring && valveOpen > 0.25) {
        if (Math.random() < 0.65) {
          spawnParticle(
            bottleCenterX + (Math.random() - 0.5) * 10,
            bottleTopY + 6,
            (Math.random() - 0.5) * 95,
            -45 - Math.random() * 85,
            1.6 + Math.random() * 2.2,
            0.35 + Math.random() * 0.28,
            '#BAE6FD',
            'splash'
          );
        }
      }

      // Continuous foam overflow trickle while in reveal if overflowed
      if (sim.overflowed && sim.gameState === 'ROUND_REVEAL' && Math.random() < 0.25) {
        spawnParticle(
          bottleCenterX + (Math.random() - 0.5) * 24,
          bottleTopY + 6,
          (Math.random() - 0.5) * 65,
          -15 - Math.random() * 40,
          3 + Math.random() * 4,
          0.6 + Math.random() * 0.4,
          '#E0F2FE',
          'foam'
        );
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Subtle warm spotlight halo behind bottle on stall counter
      const spotlight = ctx.createRadialGradient(
        bottleCenterX,
        bottleTopY + bottleHeight * 0.45,
        16,
        bottleCenterX,
        bottleTopY + bottleHeight * 0.45,
        bottleHeight * 0.95
      );
      spotlight.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
      spotlight.addColorStop(0.55, 'rgba(245, 158, 11, 0.06)');
      spotlight.addColorStop(1, 'rgba(17, 22, 34, 0)');
      ctx.fillStyle = spotlight;
      ctx.fillRect(0, 0, width, height);

      // Wooden counter top surface highlight
      const counterGrad = ctx.createLinearGradient(0, counterY - 6, 0, height);
      counterGrad.addColorStop(0, '#3D2A20');
      counterGrad.addColorStop(0.12, '#281B14');
      counterGrad.addColorStop(1, '#150E0B');
      ctx.fillStyle = counterGrad;
      ctx.fillRect(0, counterY, width, height - counterY);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
      ctx.fillRect(0, counterY, width, 1.5);

      // Bottle cast shadow on counter
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(bottleCenterX, bottleBottomY + 3, bottleWidth * 0.58, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ==========================================================
      // 1. WATER STREAM (Drawn behind bottle lip so it enters mouth)
      // ==========================================================
      if (valveOpen > 0.03) {
        const streamTop = nozzleY;
        const streamBottom = bottleTopY + 18;
        const streamHalfW = 2.5 + valveOpen * 5.2;

        // Outer cyan glow
        const streamGlow = ctx.createLinearGradient(
          bottleCenterX - 18,
          streamTop,
          bottleCenterX + 18,
          streamTop
        );
        streamGlow.addColorStop(0, 'rgba(56, 189, 248, 0)');
        streamGlow.addColorStop(0.5, `rgba(56, 189, 248, ${0.32 * valveOpen})`);
        streamGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = streamGlow;
        ctx.fillRect(bottleCenterX - 18, streamTop, 36, streamBottom - streamTop);

        // Main undulating soda stream
        ctx.beginPath();
        const steps = 18;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const y = streamTop + (streamBottom - streamTop) * t;
          const wobble = Math.sin(t * 10 - streamPhase) * 1.4 * valveOpen;
          const taper = 1 - t * 0.14;
          const x = bottleCenterX - streamHalfW * taper + wobble;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let i = steps; i >= 0; i--) {
          const t = i / steps;
          const y = streamTop + (streamBottom - streamTop) * t;
          const wobble = Math.sin(t * 10 - streamPhase + 0.8) * 1.4 * valveOpen;
          const taper = 1 - t * 0.14;
          const x = bottleCenterX + streamHalfW * taper + wobble;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const waterGrad = ctx.createLinearGradient(0, streamTop, 0, streamBottom);
        waterGrad.addColorStop(0, '#7DD3FC');
        waterGrad.addColorStop(0.5, '#38BDF8');
        waterGrad.addColorStop(1, '#0EA5E9');
        ctx.fillStyle = waterGrad;
        ctx.fill();

        // Crisp white specular core highlight
        ctx.beginPath();
        ctx.strokeStyle = `rgba(240, 249, 255, ${0.75 * valveOpen})`;
        ctx.lineWidth = 2;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const y = streamTop + (streamBottom - streamTop) * t;
          const wobble = Math.sin(t * 10 - streamPhase) * 1.1;
          const x = bottleCenterX - streamHalfW * 0.35 + wobble;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // ==========================================================
      // 2. RAMUNE BOTTLE BODY + REVEALED COLOR LAYERS
      // ==========================================================
      const bodyLeft = bottleCenterX - bottleWidth / 2;
      const bodyRight = bottleCenterX + bottleWidth / 2;
      const neckWidth = bottleWidth * 0.44;
      const waistWidth = bottleWidth * 0.36;
      const shoulderY = bottleTopY + bottleHeight * 0.25;
      const waistY = bottleTopY + bottleHeight * 0.16;
      const lipY = bottleTopY + 12;

      const traceBottlePath = () => {
        ctx.beginPath();
        ctx.moveTo(bottleCenterX - neckWidth / 2, bottleTopY);
        ctx.lineTo(bottleCenterX + neckWidth / 2, bottleTopY);
        ctx.lineTo(bottleCenterX + neckWidth / 2, lipY);
        // Codd-neck pinch (marble chamber)
        ctx.quadraticCurveTo(
          bottleCenterX + waistWidth / 2,
          waistY,
          bottleCenterX + neckWidth * 0.56,
          shoulderY * 0.88 + waistY * 0.12
        );
        // Shoulder curve out to body
        ctx.bezierCurveTo(
          bottleCenterX + bottleWidth * 0.46,
          shoulderY - 8,
          bodyRight,
          shoulderY + 12,
          bodyRight,
          shoulderY + 34
        );
        // Main cylindrical body down to rounded base
        ctx.lineTo(bodyRight, bottleBottomY - 14);
        ctx.quadraticCurveTo(bodyRight, bottleBottomY, bodyRight - 14, bottleBottomY);
        ctx.lineTo(bodyLeft + 14, bottleBottomY);
        ctx.quadraticCurveTo(bodyLeft, bottleBottomY, bodyLeft, bottleBottomY - 14);
        ctx.lineTo(bodyLeft, shoulderY + 34);
        ctx.bezierCurveTo(
          bodyLeft,
          shoulderY + 12,
          bottleCenterX - bottleWidth * 0.46,
          shoulderY - 8,
          bottleCenterX - neckWidth * 0.56,
          shoulderY * 0.88 + waistY * 0.12
        );
        ctx.quadraticCurveTo(
          bottleCenterX - waistWidth / 2,
          waistY,
          bottleCenterX - neckWidth / 2,
          lipY
        );
        ctx.closePath();
      };

      // Slight vibration while pouring (constant amplitude regardless of hidden water level!)
      const bottleVibX = sim.isPouring ? Math.sin(elapsed * 55) * 0.8 : 0;
      ctx.save();
      ctx.translate(bottleVibX, 0);

      // Draw translucent glass bottle background
      traceBottlePath();
      const glassBg = ctx.createLinearGradient(bodyLeft, 0, bodyRight, 0);
      glassBg.addColorStop(0, 'rgba(186, 230, 253, 0.22)');
      glassBg.addColorStop(0.25, 'rgba(224, 242, 254, 0.12)');
      glassBg.addColorStop(0.75, 'rgba(56, 189, 248, 0.10)');
      glassBg.addColorStop(1, 'rgba(14, 165, 233, 0.24)');
      ctx.fillStyle = glassBg;
      ctx.fill();

      // Draw internal water layers ONLY when revealing or on Title Screen decorative preview
      const showWaterInside = sim.revealProgress > 0.02 || isTitle;
      if (showWaterInside) {
        ctx.save();
        traceBottlePath();
        ctx.clip();

        const effectiveFillBottom = bottleBottomY - 6;
        const effectiveFillTop = bottleTopY + 16; // 100% overflow brim line
        const fillableH = effectiveFillBottom - effectiveFillTop;

        if (isTitle) {
          // Gentle decorative ramune level on Title Screen
          const demoRatio = 0.64 + Math.sin(elapsed * 0.8) * 0.03;
          const yTop = effectiveFillBottom - fillableH * demoRatio;
          const demoGrad = ctx.createLinearGradient(0, yTop, 0, bottleBottomY);
          demoGrad.addColorStop(0, 'rgba(56, 189, 248, 0.78)');
          demoGrad.addColorStop(1, 'rgba(2, 132, 199, 0.92)');
          ctx.fillStyle = demoGrad;
          ctx.fillRect(bodyLeft - 4, yTop, bottleWidth + 8, bottleBottomY - yTop + 6);
        } else {
          // Draw initial randomized water base
          const initH = fillableH * Math.min(1.06, sim.initialRatio);
          const initTopY = effectiveFillBottom - initH;
          ctx.fillStyle = 'rgba(30, 118, 168, 0.82)';
          ctx.fillRect(bodyLeft - 4, initTopY, bottleWidth + 8, initH + 10);

          // Draw each player's poured slice stacked vertically
          for (const seg of sim.segments) {
            const clampedEnd = Math.min(1.08, seg.endRatio);
            if (clampedEnd <= seg.startRatio) continue;
            const yBottom = effectiveFillBottom - fillableH * seg.startRatio;
            const yTop = effectiveFillBottom - fillableH * clampedEnd;
            ctx.fillStyle = seg.color;
            ctx.globalAlpha = 0.86;
            ctx.fillRect(bodyLeft - 4, yTop, bottleWidth + 8, yBottom - yTop + 1);
            ctx.globalAlpha = 1;

            // Crisp hairline separator between player pours
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(bodyLeft, yTop, bottleWidth, 1.2);
          }

          // Top surface meniscus highlight
          const totalTopY = effectiveFillBottom - fillableH * Math.min(1.05, sim.waterRatio);
          ctx.fillStyle = 'rgba(224, 242, 254, 0.65)';
          ctx.fillRect(bodyLeft, totalTopY - 1.5, bottleWidth, 3);
        }

        // Rising carbonation bubbles inside the revealed glass
        for (let b = 0; b < 14; b++) {
          const bx = bodyLeft + 14 + ((b * 37) % Math.max(20, bottleWidth - 28));
          const speed = 28 + (b % 5) * 11;
          const by =
            bottleBottomY -
            12 -
            (((elapsed * speed + b * 41) % Math.max(40, fillableH * 0.72)));
          ctx.beginPath();
          ctx.arc(bx + Math.sin(elapsed * 3 + b) * 2.5, by, 1.5 + (b % 3) * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(240, 249, 255, 0.55)';
          ctx.fill();
        }

        // 100% Brim Target Line on revealed bottle
        if (!isTitle) {
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(bottleCenterX - neckWidth * 0.65, effectiveFillTop);
          ctx.lineTo(bottleCenterX + neckWidth * 0.65, effectiveFillTop);
          ctx.stroke();
          ctx.restore();
        }

        ctx.restore();
      }

      // Glass bottle rim & specular glass reflection
      traceBottlePath();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Trapped Ramune Glass Marble inside Codd neck
      const marbleBob = sim.overflowed ? Math.sin(elapsed * 22) * 3.5 : sim.isPouring ? Math.sin(elapsed * 16) * 1.4 : 0;
      const marbleY = waistY + 10 + marbleBob;
      const marbleX = bottleCenterX - 3;
      const marbleGrad = ctx.createRadialGradient(
        marbleX - 2.5,
        marbleY - 2.5,
        1,
        marbleX,
        marbleY,
        9
      );
      marbleGrad.addColorStop(0, '#FFFFFF');
      marbleGrad.addColorStop(0.35, '#7DD3FC');
      marbleGrad.addColorStop(1, '#0284C7');
      ctx.beginPath();
      ctx.arc(marbleX, marbleY, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = marbleGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ==========================================================
      // 3. OPAQUE FESTIVAL SLEEVE COVER (100% Hides Water Level!)
      // ==========================================================
      // On Title Menu, keep bottle half-revealed or sleekly uncovered as hero showcase;
      // During PASS_DEVICE / PLAYING, sleeve is 100% covering up to the bottle neck lip!
      if (!isTitle && sim.revealProgress < 0.99) {
        const peelEase = 1 - Math.pow(1 - sim.revealProgress, 3);
        const dropOffset = peelEase * (bottleHeight * 1.05);
        const sleeveAlpha = 1 - Math.pow(peelEase, 1.8);
        const tiltAngle = peelEase * 0.14;

        ctx.save();
        ctx.globalAlpha = sleeveAlpha;
        ctx.translate(bottleCenterX, bottleBottomY + dropOffset);
        ctx.rotate(tiltAngle);
        ctx.translate(-bottleCenterX, -(bottleBottomY + dropOffset));

        const sleeveLeft = bodyLeft - 7;
        const sleeveRight = bodyRight + 7;
        const sleeveW = sleeveRight - sleeveLeft;
        // Cover from base all the way past shoulder to just below top mouth lip!
        const sleeveTop = bottleTopY + 14 + dropOffset;
        const sleeveH = bottleBottomY - (bottleTopY + 14) + 2;

        // Main kraft/cream festival paper wrap
        drawRoundRect(sleeveLeft, sleeveTop, sleeveW, sleeveH, 10);
        const paperGrad = ctx.createLinearGradient(sleeveLeft, 0, sleeveRight, 0);
        paperGrad.addColorStop(0, '#D6C7A9');
        paperGrad.addColorStop(0.22, '#F7EFE0');
        paperGrad.addColorStop(0.75, '#EFE2C8');
        paperGrad.addColorStop(1, '#C5B392');
        ctx.fillStyle = paperGrad;
        ctx.fill();
        ctx.strokeStyle = '#6B4F3A';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Clip decorative festival stripes inside sleeve
        ctx.save();
        drawRoundRect(sleeveLeft, sleeveTop, sleeveW, sleeveH, 10);
        ctx.clip();

        // Top & bottom festival indigo-crimson bands
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(sleeveLeft, sleeveTop + 12, sleeveW, 12);
        ctx.fillRect(sleeveLeft, sleeveTop + sleeveH - 26, sleeveW, 12);

        ctx.fillStyle = '#DC2626';
        ctx.fillRect(sleeveLeft, sleeveTop + 26, sleeveW, 5);
        ctx.fillRect(sleeveLeft, sleeveTop + sleeveH - 33, sleeveW, 5);

        // Diagonal subtle festival weave lines
        ctx.strokeStyle = 'rgba(120, 86, 56, 0.09)';
        ctx.lineWidth = 2;
        for (let y = sleeveTop + 36; y < sleeveTop + sleeveH - 36; y += 16) {
          ctx.beginPath();
          ctx.moveTo(sleeveLeft, y);
          ctx.lineTo(sleeveRight, y + 10);
          ctx.stroke();
        }

        // Center traditional medallion seal ("秘 · 聽聲")
        const sealY = sleeveTop + sleeveH * 0.52;
        ctx.beginPath();
        ctx.arc(bottleCenterX, sealY, Math.min(34, sleeveW * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = '#B91C1C';
        ctx.fill();
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#FEF3C7';
        ctx.font = '700 22px "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('秘', bottleCenterX, sealY - 1);

        ctx.fillStyle = '#4A3728';
        ctx.font = '700 12px "Noto Sans TC", sans-serif';
        ctx.fillText('請聽水聲辨水位', bottleCenterX, sealY + Math.min(48, sleeveW * 0.38));

        ctx.restore();
        ctx.restore();
      }

      // Top glass lip ring (always visible above sleeve so water enters cleanly)
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(bottleCenterX - neckWidth * 0.58, bottleTopY - 3, neckWidth * 1.16, 9, 4)
        : drawRoundRect(bottleCenterX - neckWidth * 0.58, bottleTopY - 3, neckWidth * 1.16, 9, 4);
      ctx.fillStyle = 'rgba(224, 242, 254, 0.72)';
      ctx.fill();
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.restore(); // end bottleVibX translate

      // ==========================================================
      // 4. TOP BRASS & CHROME STREET-STALL FAUCET
      // ==========================================================
      ctx.save();
      // Overhead pipe bracket attached to stall eave
      ctx.fillStyle = '#33241D';
      ctx.fillRect(bottleCenterX - 44, 0, 88, faucetY - 10);
      ctx.strokeStyle = '#785A40';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bottleCenterX - 44, 0, 88, faucetY - 10);

      // Vertical brass riser & curved spout
      const brassGrad = ctx.createLinearGradient(bottleCenterX - 18, 0, bottleCenterX + 18, 0);
      brassGrad.addColorStop(0, '#926B27');
      brassGrad.addColorStop(0.35, '#FCD34D');
      brassGrad.addColorStop(0.7, '#D97706');
      brassGrad.addColorStop(1, '#78480E');

      // Main faucet body
      drawRoundRect(bottleCenterX - 16, faucetY - 14, 32, 46, 8);
      ctx.fillStyle = brassGrad;
      ctx.fill();
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Downward spout nozzle
      drawRoundRect(bottleCenterX - 10, faucetY + 26, 20, 32, 4);
      ctx.fillStyle = brassGrad;
      ctx.fill();
      ctx.stroke();

      // Nozzle tip collar
      drawRoundRect(bottleCenterX - 12, nozzleY - 5, 24, 7, 2);
      ctx.fillStyle = '#E2E8F0';
      ctx.fill();

      // Valve Hub + Minimum Pour Arc (shows ONLY current turn minimum pour 0..0.4s)
      const hubX = bottleCenterX;
      const hubY = faucetY + 8;
      ctx.beginPath();
      ctx.arc(hubX, hubY, 21, 0, Math.PI * 2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (!isTitle && sim.gameState === 'PLAYING') {
        const p = Math.max(0, Math.min(1, sim.minPourProgress));
        if (p > 0.01) {
          ctx.beginPath();
          ctx.arc(hubX, hubY, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
          ctx.strokeStyle = sim.minPourReached ? '#34D399' : '#FBBF24';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        if (minPulseTimer > 0) {
          const ringScale = 1 + (1 - minPulseTimer / 0.55) * 0.65;
          ctx.beginPath();
          ctx.arc(hubX, hubY, 24 * ringScale, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(52, 211, 153, ${minPulseTimer / 0.55})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }

      // Rotating cross-valve handle
      ctx.save();
      ctx.translate(hubX, hubY);
      ctx.rotate(valveOpen * Math.PI * 0.72 + (isTitle ? Math.sin(elapsed * 0.9) * 0.05 : 0));
      ctx.strokeStyle = '#FEF3C7';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.lineTo(13, 0);
      ctx.moveTo(0, -13);
      ctx.lineTo(0, 13);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = sim.isPouring ? '#38BDF8' : '#F59E0B';
      ctx.fill();
      ctx.restore();

      ctx.restore();

      // ==========================================================
      // 5. PARTICLE POOL UPDATE & RENDER
      // ==========================================================
      const pool = particlesRef.current;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        const t = p.life / p.maxLife;
        if (p.kind === 'splash' || p.kind === 'foam') {
          p.vy += 460 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'splash' && p.y > counterY) {
          p.y = counterY;
          p.vy *= -0.25;
          p.vx *= 0.65;
        }
        p.alpha = 1 - t;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (p.kind === 'foam' ? 1 + t * 0.45 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // end camera shake
      ctx.restore(); // end dpr scale

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [simRef]);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onStagePointerDown?.();
      }}
      onPointerUp={(e) => {
        if (!interactive) return;
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onStagePointerUp?.();
      }}
      onPointerCancel={() => {
        if (!interactive) return;
        onStagePointerUp?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`block w-full h-full touch-none ${
        interactive ? 'cursor-pointer' : 'pointer-events-none'
      }`}
      aria-label="夜市彈珠汽水倒水遊戲舞台"
    />
  );
};
