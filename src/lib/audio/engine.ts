import { STEPS, VOICES, type Pattern, type VoiceId } from "@/lib/sequencer/pattern";

export type RackParams = {
  pattern: Pattern;
  bpm: number;
  swing: number;
  volume: number;
  muted: boolean;
};

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

function envGain(ctx: BaseAudioContext, peak: number, time: number, attack: number, decay: number): GainNode {
  const gain = ctx.createGain();
  const safePeak = Math.max(0.001, peak);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(safePeak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  return gain;
}

function startOsc(
  ctx: BaseAudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  time: number,
  peak: number,
  attack: number,
  decay: number,
  endFreq?: number,
): void {
  const osc = ctx.createOscillator();
  const gain = envGain(ctx, peak, time, attack, decay);
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), time);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), time + attack + decay);
  osc.connect(gain);
  gain.connect(dest);
  const stopAt = time + attack + decay + 0.02;
  osc.start(time);
  osc.stop(stopAt);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function startNoise(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  duration: number,
  peak: number,
  filter: { type: BiquadFilterType; freq: number; q?: number },
): void {
  const source = ctx.createBufferSource();
  const gain = envGain(ctx, peak, time, 0.002, Math.max(0.01, duration));
  const shaped = ctx.createBiquadFilter();
  source.buffer = noiseBuffer(ctx);
  shaped.type = filter.type;
  shaped.frequency.setValueAtTime(filter.freq, time);
  if (filter.q) shaped.Q.setValueAtTime(filter.q, time);
  source.connect(shaped);
  shaped.connect(gain);
  gain.connect(dest);
  const offset = Math.random() * Math.max(0.05, source.buffer.duration - duration - 0.05);
  source.start(time, offset, duration + 0.02);
  source.stop(time + duration + 0.03);
  source.onended = () => {
    source.disconnect();
    shaped.disconnect();
    gain.disconnect();
  };
}

export function triggerVoice(
  voice: VoiceId,
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  step: number,
): void {
  if (voice === "kick") {
    startOsc(ctx, dest, "sine", 168, time, 0.95, 0.004, 0.4, 36);
    startOsc(ctx, dest, "triangle", 720, time, 0.18, 0.001, 0.022, 90);
    return;
  }

  if (voice === "snare") {
    startNoise(ctx, dest, time, 0.16, 0.42, { type: "highpass", freq: 1800 });
    startOsc(ctx, dest, "sine", 196, time, 0.38, 0.003, 0.11, 140);
    startOsc(ctx, dest, "triangle", 340, time, 0.12, 0.001, 0.03, 180);
    return;
  }

  if (voice === "hat") {
    const accent = step % 4 === 2 ? 1.2 : step % 2 === 0 ? 1 : 0.68;
    const bus = ctx.createGain();
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(6500, time);
    const peak = 0.13 * accent;
    bus.gain.setValueAtTime(0.0001, time);
    bus.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    bus.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    bus.connect(highpass);
    highpass.connect(dest);
    const freqs = [296, 374, 472, 588, 742, 932];
    let alive = freqs.length + 1;
    const release = () => {
      alive -= 1;
      if (alive > 0) return;
      bus.disconnect();
      highpass.disconnect();
    };
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.01), time);
      osc.connect(bus);
      osc.start(time);
      osc.stop(time + 0.07);
      osc.onended = () => {
        osc.disconnect();
        release();
      };
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.connect(bus);
    noise.start(time, Math.random() * 0.5, 0.06);
    noise.stop(time + 0.07);
    noise.onended = () => {
      noise.disconnect();
      release();
    };
    return;
  }

  const drift = 1 + (Math.random() - 0.5) * 0.04;
  startOsc(ctx, dest, "sine", 620 * drift, time, 0.32, 0.001, 0.055, 480 * drift);
  startOsc(ctx, dest, "square", 980 * drift, time, 0.08, 0.001, 0.02, 700);
  startNoise(ctx, dest, time, 0.03, 0.16, { type: "bandpass", freq: 2400, q: 1.4 });
}

function stepDuration(bpm: number): number {
  return 60 / Math.max(40, bpm) / 4;
}

export function swingOffset(step: number, bpm: number, swing: number): number {
  if (step % 2 === 0) return 0;
  const amount = Math.min(100, Math.max(0, swing)) / 100;
  return stepDuration(bpm) * amount * 0.5;
}

function makeSaturator(ctx: BaseAudioContext): WaveShaperNode {
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35);
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

class DrumEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private params: RackParams | null = null;
  private playing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextTime = 0;
  private step = 0;
  private generation = 0;
  private onStep: ((step: number) => void) | null = null;
  private watchingVisibility = false;
  private meter = new Uint8Array(512);

  setParams(params: RackParams): void {
    this.params = params;
    this.applyGain();
  }

  setStepListener(listener: ((step: number) => void) | null): void {
    this.onStep = listener;
  }

  unlock(): void {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
    this.applyGain();
  }

  preview(voice: VoiceId): void {
    this.unlock();
    if (!this.ctx || !this.bus) return;
    triggerVoice(voice, this.ctx, this.bus, this.ctx.currentTime + 0.01, 0);
  }

  start(): void {
    this.unlock();
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.generation += 1;
    this.tick();
  }

  stop(): void {
    this.playing = false;
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onStep?.(-1);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  sample(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.meter);
    let sum = 0;
    for (let i = 0; i < this.meter.length; i += 1) {
      const sample = ((this.meter[i] ?? 128) - 128) / 128;
      sum += sample * sample;
    }
    return Math.min(1, Math.sqrt(sum / this.meter.length) * 3.4);
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio is not available in this browser.");
    const ctx = new Ctor({ latencyHint: "interactive" });
    const bus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-16, ctx.currentTime);
    comp.knee.setValueAtTime(18, ctx.currentTime);
    comp.ratio.setValueAtTime(3.2, ctx.currentTime);
    comp.attack.setValueAtTime(0.003, ctx.currentTime);
    comp.release.setValueAtTime(0.18, ctx.currentTime);
    const shaper = makeSaturator(ctx);
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    bus.connect(comp);
    comp.connect(shaper);
    shaper.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.bus = bus;
    this.master = master;
    this.analyser = analyser;
    this.meter = new Uint8Array(analyser.fftSize);
    if (!this.watchingVisibility) {
      this.watchingVisibility = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.ctx?.state === "suspended") {
          void this.ctx.resume();
        }
      });
    }
    this.applyGain();
    return ctx;
  }

  private applyGain(): void {
    if (!this.master || !this.ctx || !this.params) return;
    const level = this.params.muted ? 0 : (this.params.volume / 100) ** 2 * 0.9;
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
  }

  private tick = (): void => {
    if (!this.playing || !this.ctx) return;
    if (this.nextTime < this.ctx.currentTime - 0.2) {
      this.nextTime = this.ctx.currentTime + 0.05;
    }
    const generation = this.generation;
    while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.schedule(this.step, this.nextTime, generation);
      this.advance();
    }
    this.timer = setTimeout(this.tick, LOOKAHEAD_MS);
  };

  private advance(): void {
    const bpm = this.params?.bpm ?? 120;
    this.nextTime += stepDuration(bpm);
    this.step = (this.step + 1) % STEPS;
  }

  private schedule(step: number, gridTime: number, generation: number): void {
    const params = this.params;
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus || !params) return;
    const when = gridTime + swingOffset(step, params.bpm, params.swing);
    if (when >= ctx.currentTime - 0.03) {
      for (const voice of VOICES) {
        if (params.pattern[voice.id][step]) triggerVoice(voice.id, ctx, bus, when, step);
      }
    }
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    window.setTimeout(() => {
      if (generation !== this.generation || !this.playing) return;
      this.onStep?.(step);
    }, delay);
  }
}

export const engine = new DrumEngine();
