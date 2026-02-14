import { randomUUID } from "node:crypto";
import { pickSecretWords } from "./word-bank.js";
import {
  AgentInterface,
  Attempt,
  DeductionRow,
  GameRoom,
  JoinableRoomSummary,
  Player,
  RoundPhase,
  Team,
  TeamId
} from "../types/game.js";

const SPEAKING_TIMEOUT_MS = 60_000;

const randomCode = (): [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4] => {
  const values: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return [values[0], values[1], values[2]];
};

const equalCode = (
  a: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4],
  b: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]
): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

const requireTeam = (room: GameRoom, teamId: TeamId): Team => {
  const team = room.teams[teamId];
  if (!team) {
    throw new Error("Team not found");
  }
  return team;
};

export class GameService {
  private onRoomChanged?: (roomId: string) => void;

  private rooms = new Map<string, GameRoom>();
  private agentInterface?: AgentInterface;

  setAgentInterface(agent: AgentInterface): void {
    this.agentInterface = agent;
  }

  setOnRoomChanged(callback: (roomId: string) => void): void {
    this.onRoomChanged = callback;
  }

  private notifyRoomChanged(roomId: string): void {
    this.onRoomChanged?.(roomId);
  }

  createRoom(hostSocketId: string, nickname: string, targetPlayerCount: 4 | 6 | 8): { room: GameRoom; player: Player } {
    const playerId = randomUUID();
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const player: Player = {
      id: playerId,
      socketId: hostSocketId,
      nickname,
      joinedAt: Date.now()
    };
    const room: GameRoom = {
      id: roomId,
      roomName: `${nickname}的房间`,
      hostPlayerId: playerId,
      targetPlayerCount,
      createdAt: Date.now(),
      status: "LOBBY",
      round: 1,
      activeTeamTurn: 0,
      players: { [playerId]: player },
      teams: {},
      teamOrder: [],
      attemptHistory: [],
      deductionRows: [],
      timers: {}
    };
    this.rooms.set(roomId, room);
    this.notifyRoomChanged(room.id);
    return { room, player };
  }

  joinRoom(roomId: string, socketId: string, nickname: string): { room: GameRoom; player: Player } {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "LOBBY") {
      throw new Error("Game already started");
    }
    const currentSize = Object.keys(room.players).length;
    if (currentSize >= room.targetPlayerCount) {
      throw new Error("Room is full");
    }
    const player: Player = {
      id: randomUUID(),
      socketId,
      nickname,
      joinedAt: Date.now()
    };
    room.players[player.id] = player;
    this.notifyRoomChanged(room.id);
    return { room, player };
  }

  leaveRoom(roomId: string, playerId: string): { roomId: string } {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "LOBBY") {
      throw new Error("Cannot leave after game start");
    }
    if (room.hostPlayerId === playerId) {
      throw new Error("Host must disband room");
    }
    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }

    delete room.players[playerId];
    this.notifyRoomChanged(room.id);
    return { roomId: room.id };
  }

  disbandRoom(roomId: string, callerPlayerId: string): { roomId: string; affectedSocketIds: string[] } {
    const room = this.getRoomOrThrow(roomId);
    if (room.hostPlayerId !== callerPlayerId) {
      throw new Error("Only host can disband room");
    }

    this.clearSpeakingTimer(room);
    const affectedSocketIds = Object.values(room.players)
      .map((player) => player.socketId)
      .filter((socketId) => Boolean(socketId));

    this.rooms.delete(room.id);
    this.notifyRoomChanged(room.id);
    return { roomId: room.id, affectedSocketIds };
  }

  reconnectPlayer(roomId: string, playerId: string, socketId: string): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }
    player.socketId = socketId;
    this.notifyRoomChanged(room.id);
    return room;
  }

  startGame(roomId: string, callerPlayerId: string): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.hostPlayerId !== callerPlayerId) {
      throw new Error("Only host can start");
    }
    if (room.status !== "LOBBY") {
      throw new Error("Game already started");
    }

    const playerIds = Object.keys(room.players);
    if (playerIds.length !== room.targetPlayerCount) {
      throw new Error("Player count mismatch");
    }

    const teamCount = room.targetPlayerCount / 2;
    for (let i = 0; i < teamCount; i += 1) {
      const teamId = `T${i + 1}`;
      room.teamOrder.push(teamId);
      room.teams[teamId] = {
        id: teamId,
        label: `Team ${String.fromCharCode(65 + i)}`,
        playerIds: [],
        secretWords: pickSecretWords(i + Math.floor(Math.random() * 100)),
        score: 0
      };
    }

    const sortedPlayers = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
    sortedPlayers.forEach((player, index) => {
      const teamId = room.teamOrder[Math.floor(index / 2)];
      const team = requireTeam(room, teamId);
      player.teamId = teamId;
      player.seatIndex = index % 2;
      team.playerIds.push(player.id);
    });

    room.status = "IN_GAME";
    room.round = 1;
    room.activeTeamTurn = 0;
    this.startAttempt(room);
    this.notifyRoomChanged(room.id);
    return room;
  }

  submitClues(roomId: string, playerId: string, rawClues: [string, string, string]): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "IN_GAME" || room.phase !== "SPEAKING" || !room.currentAttempt) {
      throw new Error("Not in speaking phase");
    }
    if (room.currentAttempt.speakerPlayerId !== playerId) {
      throw new Error("Only current speaker can submit clues");
    }

    const clues = rawClues.map((value) => value.trim().slice(0, 10)) as [string, string, string];
    room.currentAttempt.clues = clues;
    room.currentAttempt.cluesSubmittedAt = Date.now();
    this.clearSpeakingTimer(room);
    room.phase = "GUESSING";
    this.notifyRoomChanged(room.id);
    return room;
  }

  submitGuess(roomId: string, playerId: string, targetTeamId: string, guess: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "IN_GAME" || room.phase !== "GUESSING" || !room.currentAttempt) {
      throw new Error("Not in guessing phase");
    }

    const player = room.players[playerId];
    if (!player?.teamId) {
      throw new Error("Player not in team");
    }

    const attempt = room.currentAttempt;
    if (attempt.targetTeamId !== targetTeamId) {
      throw new Error("Target mismatch");
    }

    if (player.teamId === targetTeamId) {
      if (attempt.internalGuess) {
        throw new Error("Internal guess already submitted");
      }
      attempt.internalGuess = guess;
    } else {
      if (attempt.interceptGuesses[player.teamId]) {
        throw new Error("Intercept guess already submitted by your team");
      }
      attempt.interceptGuesses[player.teamId] = guess;
    }

    if (this.isGuessingComplete(room, attempt)) {
      this.resolveAttempt(room, attempt);
    }

    this.notifyRoomChanged(room.id);
    return room;
  }

  handleDisconnect(socketId: string): GameRoom[] {
    const impacted: GameRoom[] = [];
    for (const room of this.rooms.values()) {
      const player = Object.values(room.players).find((p) => p.socketId === socketId);
      if (player) {
        player.socketId = "";
        impacted.push(room);
        this.notifyRoomChanged(room.id);
      }
    }
    return impacted;
  }

  getProjectedState(roomId: string, playerId: string): unknown {
    const room = this.getRoomOrThrow(roomId);
    const me = room.players[playerId];
    if (!me) {
      throw new Error("Player not found in room");
    }

    const teams = room.teamOrder.map((teamId) => {
      const team = room.teams[teamId];
      return {
        id: team.id,
        label: team.label,
        score: team.score,
        players: team.playerIds.map((pid) => {
          const p = room.players[pid];
          return {
            id: p.id,
            nickname: p.nickname,
            online: Boolean(p.socketId)
          };
        }),
        secretWords: me.teamId === teamId ? team.secretWords : undefined
      };
    });

    const currentAttempt = room.currentAttempt
      ? {
          id: room.currentAttempt.id,
          round: room.currentAttempt.round,
          targetTeamId: room.currentAttempt.targetTeamId,
          speakerPlayerId: room.currentAttempt.speakerPlayerId,
          startedAt: room.currentAttempt.startedAt,
          clues: room.currentAttempt.clues,
          code:
            room.currentAttempt.speakerPlayerId === playerId
              ? room.currentAttempt.code
              : undefined,
          internalGuessSubmitted: Boolean(room.currentAttempt.internalGuess),
          interceptTeamsSubmitted: Object.keys(room.currentAttempt.interceptGuesses)
        }
      : undefined;

    return {
      roomId: room.id,
      roomName: room.roomName,
      status: room.status,
      phase: room.phase,
      round: room.round,
      me: {
        id: me.id,
        nickname: me.nickname,
        teamId: me.teamId,
        isHost: me.id === room.hostPlayerId
      },
      teams,
      currentAttempt,
      deductionRows: room.deductionRows,
      history: room.attemptHistory.map((attempt) => ({
        round: attempt.round,
        targetTeamId: attempt.targetTeamId,
        clues: attempt.clues,
        code: attempt.code,
        internalGuess: attempt.internalGuess,
        interceptGuesses: attempt.interceptGuesses,
        scoreDeltas: attempt.scoreDeltas
      })),
      winnerTeamIds: room.winnerTeamIds
    };
  }

  listJoinableRooms(): JoinableRoomSummary[] {
    const rooms = Array.from(this.rooms.values())
      .filter((room) => room.status === "LOBBY")
      .filter((room) => Object.keys(room.players).length < room.targetPlayerCount)
      .sort((a, b) => b.createdAt - a.createdAt);

    return rooms.map((room) => {
      const host = room.players[room.hostPlayerId];
      return {
        roomId: room.id,
        roomName: room.roomName,
        hostNickname: host?.nickname ?? "未知房主",
        status: room.status,
        currentPlayerCount: Object.keys(room.players).length,
        targetPlayerCount: room.targetPlayerCount
      };
    });
  }

  getRoomOrThrow(roomId: string): GameRoom {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    return room;
  }

  private startAttempt(room: GameRoom): void {
    if (room.status !== "IN_GAME") {
      return;
    }

    const teamCount = room.teamOrder.length;
    if (teamCount < 2) {
      room.status = "FINISHED";
      room.winnerTeamIds = teamCount === 1 ? [room.teamOrder[0]] : [];
      return;
    }

    const activeIndex = room.activeTeamTurn % teamCount;
    const targetTeamId = room.teamOrder[activeIndex];
    const targetTeam = requireTeam(room, targetTeamId);
    const speakerIdx = (room.round - 1) % 2;
    const speakerPlayerId = targetTeam.playerIds[speakerIdx] ?? targetTeam.playerIds[0];

    const attempt: Attempt = {
      id: randomUUID(),
      round: room.round,
      targetTeamId,
      speakerPlayerId,
      code: randomCode(),
      clues: null,
      interceptGuesses: {},
      scoreDeltas: [],
      resolved: false,
      startedAt: Date.now()
    };

    room.currentAttempt = attempt;
    room.phase = "SPEAKING";
    this.armSpeakingTimeout(room);
  }

  private clearSpeakingTimer(room: GameRoom): void {
    if (room.timers.speakingTimeout) {
      clearTimeout(room.timers.speakingTimeout);
      room.timers.speakingTimeout = undefined;
    }
  }

  private armSpeakingTimeout(room: GameRoom): void {
    this.clearSpeakingTimer(room);
    room.timers.speakingTimeout = setTimeout(() => {
      if (room.status !== "IN_GAME" || room.phase !== "SPEAKING" || !room.currentAttempt) {
        return;
      }
      room.currentAttempt.clues = ["", "", ""];
      room.currentAttempt.cluesSubmittedAt = Date.now();
      room.phase = "GUESSING";
      this.notifyRoomChanged(room.id);
    }, SPEAKING_TIMEOUT_MS);
  }

  private isGuessingComplete(room: GameRoom, attempt: Attempt): boolean {
    if (!attempt.clues) {
      return false;
    }
    const interceptTeams = room.teamOrder.filter((id) => id !== attempt.targetTeamId);
    const hasInternal = Boolean(attempt.internalGuess);
    const interceptDone = interceptTeams.every((teamId) => Boolean(attempt.interceptGuesses[teamId]));
    return hasInternal && interceptDone;
  }

  private resolveAttempt(room: GameRoom, attempt: Attempt): void {
    if (attempt.resolved || !attempt.clues || !attempt.internalGuess) {
      return;
    }
    attempt.resolved = true;
    attempt.scoreDeltas = [];

    const isInternalCorrect = equalCode(attempt.code, attempt.internalGuess);

    for (const [teamId, guess] of Object.entries(attempt.interceptGuesses)) {
      if (!guess || !equalCode(attempt.code, guess)) {
        continue;
      }
      const team = room.teams[teamId];
      if (!team) {
        continue;
      }
      team.score += 1;
      attempt.scoreDeltas.push({
        teamId,
        points: 1,
        reason: "INTERCEPT_CORRECT"
      });
    }

    if (!isInternalCorrect) {
      for (const teamId of room.teamOrder) {
        if (teamId === attempt.targetTeamId) {
          continue;
        }
        const team = room.teams[teamId];
        if (!team) {
          continue;
        }
        team.score += 1;
        attempt.scoreDeltas.push({
          teamId,
          points: 1,
          reason: "INTERNAL_MISS"
        });
      }
    }

    this.recordDeduction(room, attempt);
    room.attemptHistory.push(attempt);
    room.currentAttempt = undefined;
    room.phase = undefined;

    if (this.updateWinner(room)) {
      room.status = "FINISHED";
      this.notifyRoomChanged(room.id);
      return;
    }

    const previousTeamIdx = room.teamOrder.findIndex((teamId) => teamId === attempt.targetTeamId);
    let nextIdx = previousTeamIdx + 1;
    if (nextIdx >= room.teamOrder.length) {
      nextIdx = 0;
      room.round += 1;
    }
    room.activeTeamTurn = nextIdx;
    this.startAttempt(room);
    this.notifyRoomChanged(room.id);
  }

  private updateWinner(room: GameRoom): boolean {
    const winners = room.teamOrder.filter((teamId) => room.teams[teamId].score >= 2);
    if (winners.length === 0) {
      room.winnerTeamIds = undefined;
      return false;
    }

    room.winnerTeamIds = winners;
    return true;
  }

  private recordDeduction(room: GameRoom, attempt: Attempt): void {
    if (!attempt.clues) {
      return;
    }
    const row: DeductionRow = {
      round: attempt.round,
      teamId: attempt.targetTeamId,
      byNumber: {
        1: "",
        2: "",
        3: "",
        4: ""
      }
    };

    row.byNumber[attempt.code[0]] = attempt.clues[0];
    row.byNumber[attempt.code[1]] = attempt.clues[1];
    row.byNumber[attempt.code[2]] = attempt.clues[2];

    room.deductionRows.push(row);
  }

  async handleAIAction(roomId: string, teamId: string): Promise<[string, string, string]> {
    const room = this.getRoomOrThrow(roomId);
    const attempt = room.currentAttempt;
    if (!attempt || attempt.targetTeamId !== teamId) {
      throw new Error("No active attempt for this team");
    }

    const team = requireTeam(room, teamId);

    if (!this.agentInterface) {
      return ["", "", ""];
    }

    const result = await this.agentInterface({
      secretWords: team.secretWords,
      history: room.deductionRows.filter((r) => r.teamId === teamId),
      code: attempt.code
    });

    return result.clues;
  }
}
