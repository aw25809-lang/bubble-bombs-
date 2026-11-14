/**
 * Procedural Web Audio acoustic water-filling synthesizer.
 * Models air-column resonance (rising pitch) and mouth-splash proximity (rising volume & crisp fizz)
 * as the hidden water level climbs from 0.0 to 1.0+.
 */

export type CalibrationLevel = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5';

export interface CalibrationTier {
  key: CalibrationLevel;
  ratio: number;
  label: string;
  sub: string;
}

export const CALIBRATION_TIERS: readonly CalibrationTier[] = [
  { key: 'tier1', ratio: 0.15, label: '15% 低沉', sub: '空瓶底層' },
  { key: 'tier2', ratio: 0.35, label: '35% 偏低', sub: '渾厚共鳴' },
  { key: 'tier3', ratio: 0.55, label: '55% 半滿', sub: '中音清亮' },
  { key: 'tier4', ratio: 0.75, label: '75% 偏高', sub: '高頻逼近' },
  { key: 'tier5', ratio: 0.92, label: '92% 瓶口', sub: '極度尖銳' },
] as const;

class WaterAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Active continuous pouring nodes
  private isPouring = false;
  private pourSource: AudioBufferSourceNode | null = null;
  private pourMasterGain: GainNode | null = null;
  private primaryResonance: BiquadFilterNode | null = null;
  private upperResonance: BiquadFilterNode | null = null;
  private splashFilter: BiquadFilterNode | null = null;
  private splashGain: GainNode | null = null;
  private bubbleTimer: number | null = null;
  private currentRatio = 0.2;

  // Calibration demo timer
  private calibrationTimer: number | null = null;
  private calibrationSource: AudioBufferSourceNode | null = null;
  private calibrationBubbleTimer: number | null = null;

  private muted = false;
  private volume = 0.85;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createPinkNoiseBuffer(this.ctx, 2.0);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's refined pink noise algorithm
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      data[i] = Math.max(-1, Math.min(1, pink));
    }

    // Crossfade start/end 512 samples for seamless looping
    const fade = 512;
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = data[i] * t + data[length - fade + i] * (1 - t);
    }
    return buffer;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private computeAcoustics(ratio: number) {
    const r = Math.max(0, Math.min(1.05, ratio));
    // Five-tier perceptual acoustic shaping:
    // 0-20% (deep hollow ~175-255Hz), 20-40% (low-mid ~255-390Hz), 40-60% (mid ~390-600Hz),
    // 60-80% (high ~600-950Hz), 80-100% (sharp neck whistle ~950-1540Hz)
    const baseFreq = 175 * Math.pow(8.8, r);
    const upperFreq = Math.min(5000, baseFreq * 1.95);
    const resonanceQ = 3.0 + Math.pow(r, 1.35) * 8.6;

    // Loudness climbs steadily across all 5 bands as water nears the opening
    const overallGain = 0.18 + Math.pow(r, 1.08) * 0.76;
    // High-frequency splash/fizz becomes prominent from tier 3 -> tier 5
    const splashAmount = 0.02 + Math.pow(Math.max(0, r - 0.12) / 0.88, 1.85) * 0.45;
    const bubblePitch = 195 + Math.pow(r, 1.32) * 940;

    return { baseFreq, upperFreq, resonanceQ, overallGain, splashAmount, bubblePitch };
  }

  public startPour(initialRatio: number): void {
    this.stopCalibration();
    if (this.isPouring) return;

    const ctx = this.ensureContext();
    if (!this.masterGain || !this.noiseBuffer) return;

    this.isPouring = true;
    this.currentRatio = initialRatio;
    const now = ctx.currentTime;
    const ac = this.computeAcoustics(initialRatio);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const primary = ctx.createBiquadFilter();
    primary.type = 'bandpass';
    primary.frequency.setValueAtTime(ac.baseFreq, now);
    primary.Q.setValueAtTime(ac.resonanceQ, now);

    const upper = ctx.createBiquadFilter();
    upper.type = 'bandpass';
    upper.frequency.setValueAtTime(ac.upperFreq, now);
    upper.Q.setValueAtTime(4.2, now);

    const upperGain = ctx.createGain();
    upperGain.gain.value = 0.55;

    const splash = ctx.createBiquadFilter();
    splash.type = 'bandpass';
    splash.frequency.setValueAtTime(2600, now);
    splash.Q.setValueAtTime(1.1, now);

    const splashG = ctx.createGain();
    splashG.gain.setValueAtTime(ac.splashAmount, now);

    const pourG = ctx.createGain();
    pourG.gain.setValueAtTime(0.001, now);
    pourG.gain.linearRampToValueAtTime(ac.overallGain, now + 0.04);

    source.connect(primary);
    source.connect(upper);
    source.connect(splash);

    primary.connect(pourG);
    upper.connect(upperGain);
    upperGain.connect(pourG);
    splash.connect(splashG);
    splashG.connect(pourG);
    pourG.connect(this.masterGain);

    source.start(now);

    this.pourSource = source;
    this.primaryResonance = primary;
    this.upperResonance = upper;
    this.splashFilter = splash;
    this.splashGain = splashG;
    this.pourMasterGain = pourG;

    this.playTapOpen();
    this.scheduleBubbleLoop();
  }

  public updatePourLevel(ratio: number): void {
    this.currentRatio = ratio;
    if (!this.isPouring || !this.ctx) return;

    const now = this.ctx.currentTime;
    const ac = this.computeAcoustics(ratio);

    this.primaryResonance?.frequency.setTargetAtTime(ac.baseFreq, now, 0.025);
    this.primaryResonance?.Q.setTargetAtTime(ac.resonanceQ, now, 0.025);
    this.upperResonance?.frequency.setTargetAtTime(ac.upperFreq, now, 0.025);
    this.splashGain?.gain.setTargetAtTime(ac.splashAmount, now, 0.03);
    this.pourMasterGain?.gain.setTargetAtTime(ac.overallGain, now, 0.025);
  }

  private scheduleBubbleLoop(): void {
    if (this.bubbleTimer !== null) {
      window.clearInterval(this.bubbleTimer);
    }
    this.triggerBubble(this.currentRatio);
    this.bubbleTimer = window.setInterval(() => {
      if (!this.isPouring) return;
      this.triggerBubble(this.currentRatio);
      if (this.currentRatio > 0.65 && Math.random() < 0.6) {
        window.setTimeout(() => {
          if (this.isPouring) this.triggerBubble(this.currentRatio);
        }, 38);
      }
    }, 78);
  }

  private triggerBubble(ratio: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const ac = this.computeAcoustics(ratio);

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const jitter = 0.88 + Math.random() * 0.26;
    const fStart = ac.bubblePitch * jitter;
    const fEnd = fStart * (1.28 + Math.random() * 0.25);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(fStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.min(3400, fEnd), now + 0.045);

    const peak = 0.05 + Math.pow(Math.max(0, Math.min(1, ratio)), 1.2) * 0.14;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public stopPour(playCloseClick = true): void {
    if (!this.isPouring) return;
    this.isPouring = false;

    if (this.bubbleTimer !== null) {
      window.clearInterval(this.bubbleTimer);
      this.bubbleTimer = null;
    }

    const ctx = this.ctx;
    const source = this.pourSource;
    const pourGain = this.pourMasterGain;

    this.pourSource = null;
    this.primaryResonance = null;
    this.upperResonance = null;
    this.splashFilter = null;
    this.splashGain = null;
    this.pourMasterGain = null;

    if (ctx && pourGain && source) {
      const now = ctx.currentTime;
      pourGain.gain.cancelScheduledValues(now);
      pourGain.gain.setTargetAtTime(0.0001, now, 0.018);
      window.setTimeout(() => {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Ignore already stopped source
        }
      }, 90);
    }

    if (playCloseClick) {
      this.playTapClose();
    }
  }

  public playTapOpen(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.045);

    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playTapClose(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);

    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playMinReached(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain || this.muted) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playOverflow(): void {
    this.stopPour(false);
    const ctx = this.ensureContext();
    if (!this.masterGain || this.muted) return;
    const now = ctx.currentTime;

    // 1. Glass marble POP!
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(320, now);
    popOsc.frequency.exponentialRampToValueAtTime(960, now + 0.065);
    popGain.gain.setValueAtTime(0.35, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    popOsc.connect(popGain);
    popGain.connect(this.masterGain);
    popOsc.start(now);
    popOsc.stop(now + 0.12);

    // 2. Pressurized soda foam eruption
    if (this.noiseBuffer) {
      const foam = ctx.createBufferSource();
      foam.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, now);
      filter.frequency.exponentialRampToValueAtTime(900, now + 0.85);
      filter.Q.value = 0.9;

      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.45, now);
      fg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      foam.connect(filter);
      filter.connect(fg);
      fg.connect(this.masterGain);
      foam.start(now);
      foam.stop(now + 0.92);
    }

    // 3. Comedic descending festival buzzer
    const buzz1 = ctx.createOscillator();
    const buzz2 = ctx.createOscillator();
    const bg = ctx.createGain();
    buzz1.type = 'sawtooth';
    buzz2.type = 'triangle';
    buzz1.frequency.setValueAtTime(240, now + 0.08);
    buzz1.frequency.linearRampToValueAtTime(135, now + 0.55);
    buzz2.frequency.setValueAtTime(248, now + 0.08);
    buzz2.frequency.linearRampToValueAtTime(130, now + 0.55);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;

    bg.gain.setValueAtTime(0.001, now);
    bg.gain.linearRampToValueAtTime(0.22, now + 0.1);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    buzz1.connect(lp);
    buzz2.connect(lp);
    lp.connect(bg);
    bg.connect(this.masterGain);
    buzz1.start(now + 0.08);
    buzz2.start(now + 0.08);
    buzz1.stop(now + 0.64);
    buzz2.stop(now + 0.64);
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!this.masterGain || this.muted) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + idx * 0.095;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  public playSampleCalibration(level: CalibrationLevel, onEnd?: () => void): void {
    this.stopPour(false);
    this.stopCalibration();

    const ctx = this.ensureContext();
    if (!this.masterGain || !this.noiseBuffer) return;

    const matched = CALIBRATION_TIERS.find((t) => t.key === level);
    const targetRatio = matched ? matched.ratio : 0.55;
    const ac = this.computeAcoustics(targetRatio);
    const now = ctx.currentTime;
    const duration = 1.25;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const primary = ctx.createBiquadFilter();
    primary.type = 'bandpass';
    primary.frequency.setValueAtTime(ac.baseFreq, now);
    primary.Q.setValueAtTime(ac.resonanceQ, now);

    const upper = ctx.createBiquadFilter();
    upper.type = 'bandpass';
    upper.frequency.setValueAtTime(ac.upperFreq, now);
    upper.Q.setValueAtTime(4.2, now);

    const splash = ctx.createBiquadFilter();
    splash.type = 'bandpass';
    splash.frequency.setValueAtTime(2600, now);
    splash.Q.setValueAtTime(1.1, now);

    const splashG = ctx.createGain();
    splashG.gain.setValueAtTime(ac.splashAmount, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(ac.overallGain, now + 0.06);
    gain.gain.setValueAtTime(ac.overallGain, now + duration - 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(primary);
    source.connect(upper);
    source.connect(splash);
    primary.connect(gain);
    upper.connect(gain);
    splash.connect(splashG);
    splashG.connect(gain);
    gain.connect(this.masterGain);

    source.start(now);
    source.stop(now + duration + 0.05);
    this.calibrationSource = source;

    this.triggerBubble(targetRatio);
    this.calibrationBubbleTimer = window.setInterval(() => {
      this.triggerBubble(targetRatio);
    }, 85);

    this.calibrationTimer = window.setTimeout(() => {
      this.stopCalibration();
      onEnd?.();
    }, duration * 1000);
  }

  public stopCalibration(): void {
    if (this.calibrationTimer !== null) {
      window.clearTimeout(this.calibrationTimer);
      this.calibrationTimer = null;
    }
    if (this.calibrationBubbleTimer !== null) {
      window.clearInterval(this.calibrationBubbleTimer);
      this.calibrationBubbleTimer = null;
    }
    if (this.calibrationSource) {
      try {
        this.calibrationSource.stop();
        this.calibrationSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.calibrationSource = null;
    }
  }

  public dispose(): void {
    this.stopPour(false);
    this.stopCalibration();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const waterAudio = new WaterAudioEngine();
