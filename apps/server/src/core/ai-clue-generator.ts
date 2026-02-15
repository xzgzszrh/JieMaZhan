import type { AgentInterfaceInput } from "../types/game.js";
import { WordServiceClient } from "./word-service-client.js";

const CLUE_MAX_LEN = 10;

const trimClue = (value: string): string => value.trim().slice(0, CLUE_MAX_LEN);

const fallbackClue = (word: string): string => trimClue(word.slice(0, 2));

const randomPick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

export class AIClueGenerator {
  constructor(private readonly wordServiceClient: WordServiceClient) {}

  async generate(input: AgentInterfaceInput): Promise<[string, string, string]> {
    const wordsByIndex = new Map(input.secretWords.map((slot) => [slot.index, slot.zh]));
    const selectedWords = input.code.map((digit) => wordsByIndex.get(digit) ?? "");

    const generated = await Promise.all(
      selectedWords.map(async (word) => {
        if (!word) {
          return "";
        }
        try {
          const neighbors = await this.wordServiceClient.getRelatedWords(word, 10);
          const candidateWords = neighbors
            .map((neighbor) => trimClue(neighbor.word))
            .filter((candidate) => candidate.length > 0);

          if (candidateWords.length === 0) {
            return fallbackClue(word);
          }

          return randomPick(candidateWords);
        } catch {
          return fallbackClue(word);
        }
      })
    );

    return [generated[0] ?? "", generated[1] ?? "", generated[2] ?? ""];
  }
}
