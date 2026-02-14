export type TeamId = string;
export type PlayerId = string;

export type GameStatus = "LOBBY" | "IN_GAME" | "FINISHED";
export type RoundPhase = "SPEAKING" | "GUESSING";

export type SecretWordSlot = {
  index: 1 | 2 | 3 | 4;
  zh: string;
  en: string;
};

export type Player = {
  id: PlayerId;
  socketId: string;
  nickname: string;
  teamId?: TeamId;
  seatIndex?: number;
  joinedAt: number;
};

export type Team = {
  id: TeamId;
  label: string;
  playerIds: PlayerId[];
  secretWords: SecretWordSlot[];
  score: number;
};

export type Attempt = {
  id: string;
  round: number;
  targetTeamId: TeamId;
  speakerPlayerId: PlayerId;
  internalGuesserPlayerId: PlayerId;
  code: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
  clues: [string, string, string] | null;
  internalGuess?: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
  internalGuessByPlayerId?: PlayerId;
  interceptGuesses: Partial<Record<PlayerId, [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]>>;
  scoreDeltas: Array<{
    teamId: TeamId;
    points: number;
    reason: "INTERCEPT_CORRECT" | "INTERNAL_MISS";
  }>;
  resolved: boolean;
  startedAt: number;
  cluesSubmittedAt?: number;
};

export type DeductionRow = {
  round: number;
  teamId: TeamId;
  byNumber: Record<1 | 2 | 3 | 4, string>;
};

export type GameRoom = {
  id: string;
  roomName: string;
  hostPlayerId: PlayerId;
  targetPlayerCount: 4 | 6 | 8;
  createdAt: number;
  status: GameStatus;
  phase?: RoundPhase;
  round: number;
  winnerTeamIds?: TeamId[];
  players: Record<PlayerId, Player>;
  teams: Record<TeamId, Team>;
  teamOrder: TeamId[];
  currentAttempts: Attempt[];
  attemptHistory: Attempt[];
  deductionRows: DeductionRow[];
  timers: {
    speakingTimeout?: NodeJS.Timeout;
  };
};

export type JoinableRoomSummary = {
  roomId: string;
  roomName: string;
  hostNickname: string;
  status: GameStatus;
  currentPlayerCount: number;
  targetPlayerCount: 4 | 6 | 8;
};

export type AgentInterfaceInput = {
  secretWords: SecretWordSlot[];
  history: DeductionRow[];
  code: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
};

export type AgentInterfaceOutput = {
  clues: [string, string, string];
};

export type AgentInterface = (input: AgentInterfaceInput) => Promise<AgentInterfaceOutput>;
