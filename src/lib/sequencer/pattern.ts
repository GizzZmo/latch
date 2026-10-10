export const STEPS = 16;

export const VOICES = [
  { id: "kick", name: "Kick", mark: "kick" },
  { id: "snare", name: "Snare", mark: "snare" },
  { id: "hat", name: "Hat", mark: "hat" },
  { id: "perc", name: "Perc", mark: "perc" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export type Pattern = Record<VoiceId, boolean[]>;

export type Groove = {
  id: string;
  name: string;
  bpm: number;
  swing: number;
  pattern: Pattern;
};

function row(score: string): boolean[] {
  return [...score].slice(0, STEPS).map((cell) => cell === "x");
}

export const GROOVES: Groove[] = [
  {
    id: "house",
    name: "House",
    bpm: 122,
    swing: 8,
    pattern: {
      kick: row("x...x...x...x..."),
      snare: row("....x.......x..."),
      hat: row("..x...x...x...x."),
      perc: row("......x.......x."),
    },
  },
  {
    id: "bap",
    name: "Boom Bap",
    bpm: 92,
    swing: 54,
    pattern: {
      kick: row("x..x......x....."),
      snare: row("....x.......x..."),
      hat: row("x.x.x.x.x.xxx.x."),
      perc: row("..x........x...."),
    },
  },
  {
    id: "techno",
    name: "Techno",
    bpm: 130,
    swing: 0,
    pattern: {
      kick: row("x...x...x...x..."),
      snare: row("....x.......x..."),
      hat: row("xxxxxxxxxxxxxxxx"),
      perc: row("..x.....x...x..x"),
    },
  },
  {
    id: "break",
    name: "Break",
    bpm: 104,
    swing: 18,
    pattern: {
      kick: row("x.....x...x....."),
      snare: row("....x.......x..x"),
      hat: row("x.xxx.x.x.xxx.x."),
      perc: row("...x........x..."),
    },
  },
];

export const DEFAULT_GROOVE = GROOVES[0]!;

export function emptyPattern(): Pattern {
  return {
    kick: Array(STEPS).fill(false),
    snare: Array(STEPS).fill(false),
    hat: Array(STEPS).fill(false),
    perc: Array(STEPS).fill(false),
  };
}

export function clonePattern(pattern: Pattern): Pattern {
  return {
    kick: pattern.kick.slice(),
    snare: pattern.snare.slice(),
    hat: pattern.hat.slice(),
    perc: pattern.perc.slice(),
  };
}

function chance(p: number): boolean {
  return Math.random() < p;
}

export function randomPattern(): Pattern {
  const kick = Array.from({ length: STEPS }, (_, i) => {
    if (i % 4 === 0) return chance(0.85);
    if (i % 2 === 0) return chance(0.28);
    return chance(0.1);
  });
  if (!kick.some(Boolean)) kick[0] = true;

  const snare = Array.from({ length: STEPS }, (_, i) => {
    if (i === 4 || i === 12) return chance(0.92);
    if (i % 4 === 2) return chance(0.16);
    return chance(0.04);
  });

  const hat = Array.from({ length: STEPS }, (_, i) => (i % 2 === 0 ? chance(0.8) : chance(0.42)));

  const perc = Array.from({ length: STEPS }, (_, i) => {
    if (i % 4 === 0) return chance(0.08);
    return chance(0.2);
  });

  return { kick, snare, hat, perc };
}

export function isPattern(value: unknown): value is Pattern {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return VOICES.every((voice) => {
    const steps = record[voice.id];
    return Array.isArray(steps) && steps.length === STEPS && steps.every((step) => typeof step === "boolean");
  });
}

export function hitCount(pattern: Pattern, voice?: VoiceId): number {
  const rows = voice ? [pattern[voice]] : VOICES.map((item) => pattern[item.id]);
  return rows.reduce((sum, steps) => sum + steps.filter(Boolean).length, 0);
}

export function swingHint(swing: number): string {
  if (swing < 8) return "Straight";
  if (swing < 40) return "Light";
  if (swing < 70) return "Shuffle";
  return "Heavy";
}
