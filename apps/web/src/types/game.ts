export type TeamView = {
  id: string;
  label: string;
  score: number;
  players: Array<{ id: string; nickname: string; online: boolean }>;
  secretWords?: Array<{ index: 1 | 2 | 3 | 4; zh: string; en: string }>;
};

export type GameView = {
  roomId: string;
  roomName: string;
  status: "LOBBY" | "IN_GAME" | "FINISHED";
  finishedReason?: "NORMAL" | "DISCONNECT_TIMEOUT" | "HOST_FORCED";
  phase?: "SPEAKING" | "GUESSING";
  round: number;
  disconnectState?: {
    startedAt: number;
    deadline: number;
    disconnectedPlayerIds: string[];
  };
  me: { id: string; nickname: string; teamId?: string; isHost: boolean };
  teams: TeamView[];
  currentAttempts: Array<{
    id: string;
    round: number;
    targetTeamId: string;
    speakerPlayerId: string;
    internalGuesserPlayerId: string;
    startedAt: number;
    clues: [string, string, string] | null;
    code?: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
    internalGuessSubmitted: boolean;
    internalGuessByMe: boolean;
    interceptPlayerIdsSubmitted: string[];
  }>;
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
  winnerTeamIds?: string[];
};
