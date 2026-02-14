export type TeamView = {
  id: string;
  label: string;
  score: number;
  bombs: number;
  raspberries: number;
  eliminated: boolean;
  players: Array<{ id: string; nickname: string; online: boolean }>;
  secretWords?: Array<{ index: 1 | 2 | 3 | 4; zh: string; en: string }>;
};

export type GameView = {
  roomId: string;
  roomName: string;
  status: "LOBBY" | "IN_GAME" | "FINISHED";
  phase?: "SPEAKING" | "GUESSING";
  round: number;
  me: { id: string; nickname: string; teamId?: string };
  teams: TeamView[];
  currentAttempt?: {
    id: string;
    round: number;
    targetTeamId: string;
    speakerPlayerId: string;
    startedAt: number;
    clues: [string, string, string] | null;
    code?: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
    internalGuessSubmitted: boolean;
    interceptTeamsSubmitted: string[];
  };
  deductionRows: Array<{
    round: number;
    teamId: string;
    byNumber: Record<1 | 2 | 3 | 4, string>;
  }>;
  history: Array<{
    round: number;
    targetTeamId: string;
    clues: [string, string, string] | null;
    code: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
    internalGuess?: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
    interceptGuesses: Record<string, [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]>;
    scoreDeltas: Array<{
      teamId: string;
      points: number;
      reason: "INTERCEPT_CORRECT" | "INTERNAL_MISS";
    }>;
  }>;
  winnerTeamId?: string;
  winnerTeamIds?: string[];
};
