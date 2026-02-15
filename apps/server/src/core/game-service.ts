import { randomUUID } from "node:crypto";
import { pickSecretWords } from "./word-bank.js";
import {
  AgentInterface,
  Attempt,
  DeductionRow,
  GameRoom,
  JoinableRoomSummary,
  Player,
  Team,
  TeamId
} from "../types/game.js";

const SPEAKING_TIMEOUT_MS = 60_000;
const DISCONNECT_TIMEOUT_MS = 30_000;

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
      players: { [playerId]: player },
      teams: {},
      teamOrder: [],
      currentAttempts: [],
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
    if (room.status !== "LOBBY" && room.status !== "FINISHED") {
      throw new Error("Cannot leave during active game");
    }
    if (room.hostPlayerId === playerId) {
      throw new Error("Host must disband room");
    }
    const player = room.players[playerId];
    if (!player) {
      throw new Error("Player not found");
    }

    if (player.teamId) {
      const team = room.teams[player.teamId];
      if (team) {
        team.playerIds = team.playerIds.filter((id) => id !== playerId);
      }
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

    this.clearAllTimers(room);
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
    this.reconcileDisconnectState(room);
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
    this.startRound(room);
    this.notifyRoomChanged(room.id);
    return room;
  }

  submitClues(roomId: string, playerId: string, rawClues: [string, string, string]): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "IN_GAME" || room.phase !== "SPEAKING" || room.currentAttempts.length === 0) {
      throw new Error("Not in speaking phase");
    }

    const attempt = room.currentAttempts.find((item) => item.speakerPlayerId === playerId);
    if (!attempt) {
      throw new Error("Only current speaker can submit clues");
    }
    if (attempt.clues) {
      throw new Error("Clues already submitted");
    }

    const clues = rawClues.map((value) => value.trim().slice(0, 10)) as [string, string, string];
    attempt.clues = clues;
    attempt.cluesSubmittedAt = Date.now();

    if (this.isSpeakingComplete(room)) {
      this.clearSpeakingTimer(room);
      room.phase = "GUESSING";
    }

    this.notifyRoomChanged(room.id);
    return room;
  }

  submitGuess(roomId: string, playerId: string, targetTeamId: string, guess: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "IN_GAME" || room.phase !== "GUESSING" || room.currentAttempts.length === 0) {
      throw new Error("Not in guessing phase");
    }

    const player = room.players[playerId];
    if (!player?.teamId) {
      throw new Error("Player not in team");
    }

    const attempt = room.currentAttempts.find((item) => item.targetTeamId === targetTeamId);
    if (!attempt) {
      throw new Error("Target mismatch");
    }

    if (player.teamId === targetTeamId) {
      if (attempt.internalGuesserPlayerId !== playerId) {
        throw new Error("Only designated teammate can submit internal guess");
      }
      if (attempt.internalGuess) {
        throw new Error("Internal guess already submitted");
      }
      attempt.internalGuess = guess;
      attempt.internalGuessByPlayerId = playerId;
    } else {
      if (attempt.interceptGuesses[playerId]) {
        throw new Error("Intercept guess already submitted by you for this target");
      }
      attempt.interceptGuesses[playerId] = guess;
    }

    if (this.isGuessingComplete(room)) {
      this.resolveRound(room);
      return room;
    }

    this.notifyRoomChanged(room.id);
    return room;
  }

  forceFinishGame(roomId: string, callerPlayerId: string): GameRoom {
    const room = this.getRoomOrThrow(roomId);
    if (room.hostPlayerId !== callerPlayerId) {
      throw new Error("Only host can force finish");
    }
    if (room.status !== "IN_GAME") {
      throw new Error("Game is not in progress");
    }

    this.finishGame(room, "HOST_FORCED");
    this.notifyRoomChanged(room.id);
    return room;
  }

  handleDisconnect(socketId: string): GameRoom[] {
    const impacted: GameRoom[] = [];
    for (const room of this.rooms.values()) {
      const player = Object.values(room.players).find((p) => p.socketId === socketId);
      if (player) {
        player.socketId = "";
        this.reconcileDisconnectState(room);
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
        })
      };
    });

    const currentAttempts = room.currentAttempts.map((attempt) => ({
      id: attempt.id,
      round: attempt.round,
      targetTeamId: attempt.targetTeamId,
      speakerPlayerId: attempt.speakerPlayerId,
      internalGuesserPlayerId: attempt.internalGuesserPlayerId,
      startedAt: attempt.startedAt,
      clues: attempt.clues,
      code: attempt.speakerPlayerId === playerId ? attempt.code : undefined,
      internalGuessSubmitted: Boolean(attempt.internalGuess),
      internalGuessByMe: attempt.internalGuessByPlayerId === playerId,
      interceptPlayerIdsSubmitted: Object.keys(attempt.interceptGuesses)
    }));

    return {
      roomId: room.id,
      roomName: room.roomName,
      status: room.status,
      finishedReason: room.finishedReason,
      phase: room.phase,
      round: room.round,
      disconnectState: room.disconnectState,
      me: {
        id: me.id,
        nickname: me.nickname,
        teamId: me.teamId,
        isHost: me.id === room.hostPlayerId
      },
      mySecretWords: me.teamId ? room.teams[me.teamId]?.secretWords : undefined,
      revealedSecretWords:
        room.status === "FINISHED"
          ? room.teamOrder.map((teamId) => {
              const team = room.teams[teamId];
              return {
                teamId: team.id,
                teamLabel: team.label,
                words: team.secretWords
              };
            })
          : undefined,
      teams,
      currentAttempts,
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

  private startRound(room: GameRoom): void {
    if (room.status !== "IN_GAME") {
      return;
    }

    const teamCount = room.teamOrder.length;
    if (teamCount < 2) {
      room.status = "FINISHED";
      room.winnerTeamIds = teamCount === 1 ? [room.teamOrder[0]] : [];
      return;
    }

    const speakerIdx = (room.round - 1) % 2;
    room.currentAttempts = room.teamOrder.map((teamId) => {
      const targetTeam = requireTeam(room, teamId);
      const speakerPlayerId = targetTeam.playerIds[speakerIdx] ?? targetTeam.playerIds[0];
      const internalGuesserPlayerId = targetTeam.playerIds.find((pid) => pid !== speakerPlayerId) ?? speakerPlayerId;

      const attempt: Attempt = {
        id: randomUUID(),
        round: room.round,
        targetTeamId: teamId,
        speakerPlayerId,
        internalGuesserPlayerId,
        code: randomCode(),
        clues: null,
        interceptGuesses: {},
        scoreDeltas: [],
        resolved: false,
        startedAt: Date.now()
      };

      return attempt;
    });

    room.phase = "SPEAKING";
    room.disconnectState = undefined;
    this.armSpeakingTimeout(room);
  }

  private clearSpeakingTimer(room: GameRoom): void {
    if (room.timers.speakingTimeout) {
      clearTimeout(room.timers.speakingTimeout);
      room.timers.speakingTimeout = undefined;
    }
  }

  private clearDisconnectTimer(room: GameRoom): void {
    if (room.timers.disconnectTimeout) {
      clearTimeout(room.timers.disconnectTimeout);
      room.timers.disconnectTimeout = undefined;
    }
  }

  private clearAllTimers(room: GameRoom): void {
    this.clearSpeakingTimer(room);
    this.clearDisconnectTimer(room);
  }

  private armSpeakingTimeout(room: GameRoom): void {
    this.clearSpeakingTimer(room);
    room.timers.speakingTimeout = setTimeout(() => {
      if (room.status !== "IN_GAME" || room.phase !== "SPEAKING" || room.currentAttempts.length === 0) {
        return;
      }

      for (const attempt of room.currentAttempts) {
        if (attempt.clues) {
          continue;
        }
        attempt.clues = ["", "", ""];
        attempt.cluesSubmittedAt = Date.now();
      }

      room.phase = "GUESSING";
      this.notifyRoomChanged(room.id);
    }, SPEAKING_TIMEOUT_MS);
  }

  private isSpeakingComplete(room: GameRoom): boolean {
    return room.currentAttempts.length > 0 && room.currentAttempts.every((attempt) => Boolean(attempt.clues));
  }

  private isGuessingComplete(room: GameRoom): boolean {
    if (room.currentAttempts.length === 0) {
      return false;
    }

    for (const attempt of room.currentAttempts) {
      if (!attempt.clues || !attempt.internalGuess) {
        return false;
      }

      for (const player of Object.values(room.players)) {
        if (!player.teamId || player.teamId === attempt.targetTeamId) {
          continue;
        }
        if (!attempt.interceptGuesses[player.id]) {
          return false;
        }
      }
    }

    return true;
  }

  private resolveRound(room: GameRoom): void {
    for (const attempt of room.currentAttempts) {
      if (!attempt.clues || !attempt.internalGuess) {
        continue;
      }

      attempt.resolved = true;
      attempt.scoreDeltas = [];

      const isInternalCorrect = equalCode(attempt.code, attempt.internalGuess);
      const interceptWinnerTeamIds = new Set<TeamId>();

      for (const [playerId, guess] of Object.entries(attempt.interceptGuesses)) {
        if (!guess || !equalCode(attempt.code, guess)) {
          continue;
        }
        const teamId = room.players[playerId]?.teamId;
        if (!teamId || teamId === attempt.targetTeamId) {
          continue;
        }
        interceptWinnerTeamIds.add(teamId);
      }

      for (const teamId of interceptWinnerTeamIds) {
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
    }

    room.currentAttempts = [];
    room.phase = undefined;
    room.disconnectState = undefined;

    if (this.updateWinner(room)) {
      this.finishGame(room, "NORMAL");
      this.notifyRoomChanged(room.id);
      return;
    }

    room.round += 1;
    this.startRound(room);
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

  private finishGame(room: GameRoom, reason: "NORMAL" | "DISCONNECT_TIMEOUT" | "HOST_FORCED"): void {
    room.status = "FINISHED";
    room.phase = undefined;
    room.finishedReason = reason;
    room.disconnectState = undefined;
    room.currentAttempts = [];
    this.clearAllTimers(room);
    if (reason !== "NORMAL") {
      room.winnerTeamIds = [];
    }
  }

  private reconcileDisconnectState(room: GameRoom): void {
    if (room.status !== "IN_GAME") {
      room.disconnectState = undefined;
      this.clearDisconnectTimer(room);
      return;
    }

    const disconnectedPlayerIds = Object.values(room.players)
      .filter((player) => !player.socketId)
      .map((player) => player.id);

    if (disconnectedPlayerIds.length === 0) {
      room.disconnectState = undefined;
      this.clearDisconnectTimer(room);
      return;
    }

    const now = Date.now();
    const currentDeadline = room.disconnectState?.deadline ?? now + DISCONNECT_TIMEOUT_MS;
    room.disconnectState = {
      startedAt: room.disconnectState?.startedAt ?? now,
      deadline: currentDeadline,
      disconnectedPlayerIds
    };

    if (room.timers.disconnectTimeout) {
      return;
    }

    const msLeft = Math.max(0, currentDeadline - now);
    room.timers.disconnectTimeout = setTimeout(() => {
      room.timers.disconnectTimeout = undefined;

      if (room.status !== "IN_GAME") {
        return;
      }

      const stillDisconnected = Object.values(room.players).some((player) => !player.socketId);
      if (!stillDisconnected) {
        room.disconnectState = undefined;
        this.notifyRoomChanged(room.id);
        return;
      }

      this.finishGame(room, "DISCONNECT_TIMEOUT");
      this.notifyRoomChanged(room.id);
    }, msLeft);
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
    const attempt = room.currentAttempts.find((item) => item.targetTeamId === teamId);
    if (!attempt) {
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
