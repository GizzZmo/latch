import { create } from "zustand";
import {
  clonePattern,
  DEFAULT_GROOVE,
  emptyPattern,
  GROOVES,
  isPattern,
  randomPattern,
  STEPS,
  type Pattern,
  type VoiceId,
} from "@/lib/sequencer/pattern";

const STORAGE_KEY = "latch.rack.v1";

export type RackData = {
  pattern: Pattern;
  bpm: number;
  swing: number;
  volume: number;
  muted: boolean;
  presetId: string | null;
};

type RackState = RackData & {
  toggleStep: (voice: VoiceId, step: number) => void;
  clearPattern: () => void;
  randomize: () => void;
  loadPreset: (id: string) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function defaultRack(): RackData {
  return {
    pattern: clonePattern(DEFAULT_GROOVE.pattern),
    bpm: DEFAULT_GROOVE.bpm,
    swing: DEFAULT_GROOVE.swing,
    volume: 80,
    muted: false,
    presetId: DEFAULT_GROOVE.id,
  };
}

export function loadRack(): RackData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RackData>;
    if (!isPattern(parsed.pattern)) return null;
    const presetId = typeof parsed.presetId === "string" ? parsed.presetId : null;
    return {
      pattern: parsed.pattern,
      bpm: clamp(parsed.bpm ?? DEFAULT_GROOVE.bpm, 60, 180),
      swing: clamp(parsed.swing ?? 0, 0, 100),
      volume: clamp(parsed.volume ?? 80, 0, 100),
      muted: Boolean(parsed.muted),
      presetId: presetId && GROOVES.some((groove) => groove.id === presetId) ? presetId : null,
    };
  } catch {
    return null;
  }
}

export function saveRack(data: RackData): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pattern: data.pattern,
        bpm: data.bpm,
        swing: data.swing,
        volume: data.volume,
        muted: data.muted,
        presetId: data.presetId,
      }),
    );
  } catch {
    // Private mode or a full disk should not break the rack.
  }
}

export const useRack = create<RackState>((set) => ({
  ...defaultRack(),
  toggleStep: (voice, step) =>
    set((state) => {
      if (step < 0 || step >= STEPS) return state;
      const next = state.pattern[voice].slice();
      next[step] = !next[step];
      return { pattern: { ...state.pattern, [voice]: next }, presetId: null };
    }),
  clearPattern: () => set({ pattern: emptyPattern(), presetId: null }),
  randomize: () => set({ pattern: randomPattern(), presetId: null }),
  loadPreset: (id) => {
    const groove = GROOVES.find((item) => item.id === id);
    if (!groove) return;
    set({
      pattern: clonePattern(groove.pattern),
      bpm: groove.bpm,
      swing: groove.swing,
      presetId: groove.id,
    });
  },
  setBpm: (bpm) => set({ bpm: clamp(bpm, 60, 180), presetId: null }),
  setSwing: (swing) => set({ swing: clamp(swing, 0, 100), presetId: null }),
  setVolume: (volume) => set({ volume: clamp(volume, 0, 100) }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
}));
