import { readFileSync } from "node:fs";
import { SecretWordSlot } from "../types/game.js";

const WORD_BANK_PATH = new URL("../data/thuocl_words_max4.txt", import.meta.url);
const SECRET_WORD_COUNT = 4;

const loadWordBank = (): string[] => {
  const raw = readFileSync(WORD_BANK_PATH, "utf-8");
  const words = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (words.length < SECRET_WORD_COUNT) {
    throw new Error(`Word bank is too small: ${words.length}`);
  }

  return words;
};

const WORD_BANK = loadWordBank();

const nextSeed = (seed: number): number => {
  // LCG PRNG for deterministic picks from the same seed.
  return (1664525 * seed + 1013904223) >>> 0;
};

export const pickSecretWords = (seed: number): SecretWordSlot[] => {
  const picked: string[] = [];
  const used = new Set<number>();
  let state = seed >>> 0;

  while (picked.length < SECRET_WORD_COUNT) {
    state = nextSeed(state);
    const idx = state % WORD_BANK.length;
    if (used.has(idx)) {
      continue;
    }
    used.add(idx);
    picked.push(WORD_BANK[idx]);
  }

  return picked.map((word, idx) => ({
    index: (idx + 1) as 1 | 2 | 3 | 4,
    zh: word
  }));
};
