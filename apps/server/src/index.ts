import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { GameService } from "./core/game-service.js";
import {
  aiActionSchema,
  createRoomSchema,
  forceFinishSchema,
  joinRoomSchema,
  reconnectSchema,
  roomActionSchema,
  startGameSchema,
  submitCluesSchema,
  submitGuessSchema
} from "./core/schemas.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const gameService = new GameService();
const broadcastJoinableRooms = (): void => {
  io.emit("rooms:update", gameService.listJoinableRooms());
};

const broadcastRoom = (roomId: string): void => {
  const room = gameService.getRoomOrThrow(roomId);
  for (const player of Object.values(room.players)) {
    if (!player.socketId) {
      continue;
    }
    io.to(player.socketId).emit("state:update", gameService.getProjectedState(roomId, player.id));
  }
};

gameService.setOnRoomChanged((roomId) => {
  try {
    broadcastRoom(roomId);
  } catch {
    // Ignore room not found in delayed callback.
  }
  broadcastJoinableRooms();
});

gameService.setAgentInterface(async ({ code, secretWords }) => {
  // Placeholder AI logic. Swap this for real agent implementation.
  const clues = code.map((digit) => secretWords.find((word) => word.index === digit)?.zh.slice(0, 2) ?? "") as [
    string,
    string,
    string
  ];
  return { clues };
});

io.on("connection", (socket) => {
  socket.emit("rooms:update", gameService.listJoinableRooms());

  socket.on("room:list", (_payload, ack) => {
    try {
      ack?.({ ok: true, rooms: gameService.listJoinableRooms() });
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("room:create", (payload, ack) => {
    try {
      const parsed = createRoomSchema.parse(payload);
      const { room, player } = gameService.createRoom(socket.id, parsed.nickname, parsed.targetPlayerCount);
      socket.join(room.id);
      ack?.({ ok: true, roomId: room.id, playerId: player.id });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("room:join", (payload, ack) => {
    try {
      const parsed = joinRoomSchema.parse(payload);
      const { room, player } = gameService.joinRoom(parsed.roomId.toUpperCase(), socket.id, parsed.nickname);
      socket.join(room.id);
      ack?.({ ok: true, roomId: room.id, playerId: player.id });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("room:reconnect", (payload, ack) => {
    try {
      const parsed = reconnectSchema.parse(payload);
      const room = gameService.reconnectPlayer(parsed.roomId.toUpperCase(), parsed.playerId, socket.id);
      socket.join(room.id);
      ack?.({ ok: true });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("room:leave", (payload, ack) => {
    try {
      const parsed = roomActionSchema.parse(payload);
      const result = gameService.leaveRoom(parsed.roomId.toUpperCase(), parsed.playerId);
      socket.leave(result.roomId);
      ack?.({ ok: true });
      io.to(socket.id).emit("session:cleared", { reason: "LEFT_ROOM" });
      broadcastRoom(result.roomId);
      broadcastJoinableRooms();
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("room:disband", (payload, ack) => {
    try {
      const parsed = roomActionSchema.parse(payload);
      const result = gameService.disbandRoom(parsed.roomId.toUpperCase(), parsed.playerId);
      for (const socketId of result.affectedSocketIds) {
        io.to(socketId).emit("session:cleared", { reason: "ROOM_DISBANDED" });
        io.sockets.sockets.get(socketId)?.leave(result.roomId);
      }
      ack?.({ ok: true });
      broadcastJoinableRooms();
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("game:start", (payload, ack) => {
    try {
      const parsed = startGameSchema.parse(payload);
      const room = gameService.startGame(parsed.roomId.toUpperCase(), parsed.playerId);
      ack?.({ ok: true });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("game:force-finish", (payload, ack) => {
    try {
      const parsed = forceFinishSchema.parse(payload);
      const room = gameService.forceFinishGame(parsed.roomId.toUpperCase(), parsed.playerId);
      ack?.({ ok: true });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("speaker:submit", (payload, ack) => {
    try {
      const parsed = submitCluesSchema.parse(payload);
      const room = gameService.submitClues(parsed.roomId.toUpperCase(), parsed.playerId, parsed.clues);
      ack?.({ ok: true });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("guess:submit", (payload, ack) => {
    try {
      const parsed = submitGuessSchema.parse(payload);
      const room = gameService.submitGuess(parsed.roomId.toUpperCase(), parsed.playerId, parsed.targetTeamId, parsed.guess);
      ack?.({ ok: true });
      broadcastRoom(room.id);
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("ai:action", async (payload, ack) => {
    try {
      const parsed = aiActionSchema.parse(payload);
      const clues = await gameService.handleAIAction(parsed.roomId.toUpperCase(), parsed.teamId);
      ack?.({ ok: true, clues });
    } catch (error) {
      ack?.({ ok: false, error: (error as Error).message });
    }
  });

  socket.on("disconnect", () => {
    const impacted = gameService.handleDisconnect(socket.id);
    impacted.forEach((room) => broadcastRoom(room.id));
  });
});

const PORT = Number(process.env.PORT ?? 4100);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on :${PORT}`);
});
