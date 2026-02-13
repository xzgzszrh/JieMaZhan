import { z } from "zod";

export const createRoomSchema = z.object({
  nickname: z.string().trim().min(1).max(24),
  targetPlayerCount: z.union([z.literal(4), z.literal(6), z.literal(8)])
});

export const joinRoomSchema = z.object({
  roomId: z.string().trim().min(4).max(12),
  nickname: z.string().trim().min(1).max(24)
});

export const reconnectSchema = z.object({
  roomId: z.string().trim(),
  playerId: z.string().trim().uuid()
});

export const startGameSchema = z.object({
  roomId: z.string().trim(),
  playerId: z.string().trim().uuid()
});

export const submitCluesSchema = z.object({
  roomId: z.string().trim(),
  playerId: z.string().trim().uuid(),
  clues: z
    .tuple([z.string().max(10), z.string().max(10), z.string().max(10)])
    .transform((arr) => arr.map((x) => x.trim()) as [string, string, string])
});

const guessDigit = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const submitGuessSchema = z.object({
  roomId: z.string().trim(),
  playerId: z.string().trim().uuid(),
  targetTeamId: z.string().trim(),
  guess: z.tuple([guessDigit, guessDigit, guessDigit]).refine(
    (tuple) => new Set(tuple).size === 3,
    "Guess digits must be unique"
  )
});

export const aiActionSchema = z.object({
  roomId: z.string().trim(),
  teamId: z.string().trim(),
  playerId: z.string().trim().uuid()
});
