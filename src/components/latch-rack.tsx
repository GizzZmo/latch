import { useEffect, useRef, useState } from "react";
import { Dices, Eraser, Play, Square, Volume2, VolumeX } from "lucide-react";
import { engine } from "@/lib/audio/engine";
import {
  GROOVES,
  hitCount,
  STEPS,
  swingHint,
  VOICES,
  type VoiceId,
} from "@/lib/sequencer/pattern";
import { loadRack, saveRack, useRack, type RackData } from "@/lib/sequencer/store";

const MARK: Record<VoiceId, string> = {
  kick: "size-2.5 rounded-full bg-current",
  snare: "size-2.5 rounded-sm bg-current",
  hat: "size-2.5 rotate-45 bg-current",
  perc: "size-2.5 rounded-full border-2 border-current",
};

function rackData(state: RackData): RackData {
  return {
    pattern: state.pattern,
    bpm: state.bpm,
    swing: state.swing,
    volume: state.volume,
    muted: state.muted,
    presetId: state.presetId,
  };
}

export function LatchRack() {
  const pattern = useRack((state) => state.pattern);
  const bpm = useRack((state) => state.bpm);
  const swing = useRack((state) => state.swing);
  const volume = useRack((state) => state.volume);
  const muted = useRack((state) => state.muted);
  const presetId = useRack((state) => state.presetId);
  const toggleStep = useRack((state) => state.toggleStep);
  const clearPattern = useRack((state) => state.clearPattern);
  const randomize = useRack((state) => state.randomize);
  const loadPreset = useRack((state) => state.loadPreset);
  const setBpm = useRack((state) => state.setBpm);
  const setSwing = useRack((state) => state.setSwing);
  const setVolume = useRack((state) => state.setVolume);
  const toggleMuted = useRack((state) => state.toggleMuted);

  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const taps = useRef<number[]>([]);
  const togglePlayRef = useRef<() => void>(() => {});
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = loadRack();
    if (saved) useRack.setState(saved);
    hydrated.current = true;
    return useRack.subscribe((state) => {
      if (!hydrated.current) return;
      saveRack(rackData(state));
    });
  }, []);

  useEffect(() => {
    engine.setParams({ pattern, bpm, swing, volume, muted });
  }, [pattern, bpm, swing, volume, muted]);

  useEffect(() => {
    engine.setStepListener((step) => setCurrentStep(step));
    return () => {
      engine.setStepListener(null);
      engine.stop();
    };
  }, []);

  function togglePlay() {
    try {
      engine.unlock();
    } catch {
      return;
    }
    if (engine.isPlaying) {
      engine.stop();
      setPlaying(false);
      setCurrentStep(-1);
      return;
    }
    engine.setParams({ pattern, bpm, swing, volume, muted });
    engine.start();
    setPlaying(true);
  }

  togglePlayRef.current = togglePlay;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      if (tag === "BUTTON") return;
      togglePlayRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onPad(voice: VoiceId, step: number) {
    const arming = !pattern[voice][step];
    toggleStep(voice, step);
    if (!arming) return;
    try {
      engine.preview(voice);
    } catch {
      // The pad still arms if audio is blocked.
    }
  }

  function onTap() {
    const now = performance.now();
    const recent = taps.current.filter((stamp) => now - stamp < 2000);
    recent.push(now);
    taps.current = recent.slice(-6);
    if (recent.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
      const gap = recent[i]! - recent[i - 1]!;
      intervals.push(gap);
    }
    const average = intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length;
    if (average > 0) setBpm(Math.round(60000 / average));
  }

  const totalHits = hitCount(pattern);
  const grooveName = GROOVES.find((groove) => groove.id === presetId)?.name ?? "Custom";
  const downbeat = playing && currentStep >= 0 && currentStep % 4 === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-1.5 py-3 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs tracking-widest text-muted uppercase">
            <span
              className={downbeat ? "size-2 rounded-full bg-accent" : "size-2 rounded-full bg-line"}
              aria-hidden="true"
            />
            Step rack
          </p>
          <h1 className="font-display text-3xl leading-none font-extrabold tracking-tight sm:text-5xl">Latch</h1>
        </div>
        <div className="flex items-end gap-3">
          <Meter />
          <div className="text-right">
            <p className="font-display text-3xl leading-none font-bold tabular-nums sm:text-5xl">{bpm}</p>
            <p className="text-xs text-muted tabular-nums">
              {playing ? "Live" : "Ready"} · {grooveName}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-3 rounded-panel border border-line bg-surface p-2 sm:mt-5 sm:p-4" aria-label="Drum machine">
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button type="button" className="btn btn-play px-2 text-sm sm:px-4 sm:text-base" onClick={togglePlay} aria-pressed={playing}>
            <span className="relative grid size-5 place-items-center" aria-hidden="true">
              <Play
                className={
                  playing
                    ? "col-start-1 row-start-1 size-5 scale-[0.25] opacity-0 blur-sm transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                    : "col-start-1 row-start-1 size-5 scale-100 opacity-100 blur-none transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                }
                fill="currentColor"
              />
              <Square
                className={
                  playing
                    ? "col-start-1 row-start-1 size-4 scale-100 opacity-100 blur-none transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                    : "col-start-1 row-start-1 size-4 scale-[0.25] opacity-0 blur-sm transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                }
                fill="currentColor"
              />
            </span>
            {playing ? "Stop" : "Play"}
          </button>
          <button type="button" className="btn btn-ghost px-2 text-sm sm:px-4 sm:text-base" onClick={clearPattern}>
            <Eraser className="size-4" aria-hidden="true" />
            Clear
          </button>
          <button type="button" className="btn btn-ghost px-2 text-sm whitespace-nowrap sm:px-4 sm:text-base" onClick={randomize}>
            <Dices className="size-4" aria-hidden="true" />
            Randomize
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs tracking-widest text-muted uppercase">
              <label htmlFor="tempo">Tempo</label>
              <span className="text-fg tabular-nums normal-case">{bpm}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="tempo"
                className="range"
                type="range"
                min={60}
                max={180}
                value={bpm}
                onChange={(event) => setBpm(Number(event.target.value))}
              />
              <button type="button" className="btn btn-ghost shrink-0 px-2.5 text-sm" onClick={onTap}>
                Tap
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs tracking-widest text-muted uppercase">
              <label htmlFor="swing">Swing</label>
              <span className="truncate text-fg tabular-nums normal-case">
                {swing}% {swingHint(swing)}
              </span>
            </div>
            <input
              id="swing"
              className="range"
              type="range"
              min={0}
              max={100}
              value={swing}
              onChange={(event) => setSwing(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost w-11 shrink-0 px-0"
            onClick={toggleMuted}
            aria-pressed={muted}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <label className="sr-only" htmlFor="volume">
            Volume
          </label>
          <input
            id="volume"
            className="range min-w-0 flex-1"
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto" role="group" aria-label="Grooves">
          {GROOVES.map((groove) => (
            <button
              key={groove.id}
              type="button"
              className="btn btn-ghost shrink-0 px-3 text-sm"
              data-on={presetId === groove.id ? "true" : "false"}
              aria-pressed={presetId === groove.id}
              onClick={() => loadPreset(groove.id)}
            >
              {groove.name}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-8 gap-px lg:grid-cols-16 lg:gap-1.5" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, step) => {
            const lit = step === currentStep;
            const beat = step % 4 === 0;
            return (
              <span
                key={step}
                className={
                  lit ? "h-1.5 rounded-full bg-accent" : beat ? "h-1.5 rounded-full bg-muted" : "h-1.5 rounded-full bg-line"
                }
              />
            );
          })}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {VOICES.map((voice) => {
            const hits = hitCount(pattern, voice.id);
            return (
              <div key={voice.id}>
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-wide">
                    <span className={MARK[voice.id]} aria-hidden="true" />
                    {voice.name}
                  </h2>
                  <span className="text-xs text-faint tabular-nums">{hits}</span>
                </div>
                <div className="grid grid-cols-8 gap-px lg:grid-cols-16 lg:gap-1.5" role="group" aria-label={`${voice.name} steps`}>
                  {pattern[voice.id].map((on, step) => {
                    const now = step === currentStep;
                    const beat = step % 4 === 0;
                    return (
                      <button
                        key={step}
                        type="button"
                        className="pad"
                        data-on={on ? "true" : "false"}
                        data-now={now ? "true" : "false"}
                        data-beat={beat ? "true" : "false"}
                        aria-pressed={on}
                        aria-label={`${voice.name} step ${step + 1}${now ? ", playing" : ""}`}
                        onClick={() => onPad(voice.id, step)}
                      >
                        {step + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {totalHits === 0 ? (
          <p className="mt-3 text-sm text-muted">All quiet. Light a few pads, or load a groove.</p>
        ) : null}
      </section>

      <p className="mt-3 px-1 text-xs text-faint">
        Space plays and stops. Lighting a pad previews that voice. Your pattern stays on this device.
      </p>
    </main>
  );
}

function Meter() {
  const [levels, setLevels] = useState(() => Array.from({ length: 8 }, () => 0));

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const history = Array.from({ length: 8 }, () => 0);
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < 48) return;
      last = time;
      const level = engine.sample();
      const wasSilent = history.every((bar) => bar < 0.01);
      history.push(level);
      history.shift();
      if (wasSilent && level < 0.01) return;
      setLevels(history.slice());
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-1 origin-bottom rounded-sm bg-accent"
          style={{
            height: "100%",
            transform: `scaleY(${Math.max(0.12, Math.min(1, level))})`,
            opacity: level > 0.08 ? 1 : 0.28,
          }}
        />
      ))}
    </div>
  );
}
