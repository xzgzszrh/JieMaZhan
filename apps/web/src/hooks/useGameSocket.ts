"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket } from "@/lib/socket";
import { GameView } from "@/types/game";

type Ack<T> = (response: { ok: boolean; error?: string } & T) => void;
type Identity = { roomId: string; playerId: string };
export type JoinableRoom = {
  roomId: string;
  roomName: string;
  hostNickname: string;
  status: "LOBBY" | "IN_GAME" | "FINISHED";
  currentPlayerCount: number;
  targetPlayerCount: 4 | 6 | 8;
};

const parseDebugModeFromUrl = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const value = params.get("debug_multi_player");
  return value === "1" || value === "true";
};

export const useGameSocket = () => {
  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<GameView | null>(null);
  const [availableRooms, setAvailableRooms] = useState<JoinableRoom[]>([]);
  const [error, setError] = useState<string>("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const debugMultiPlayer = useMemo(() => parseDebugModeFromUrl(), []);
  const identityStorage = useMemo<Storage | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return debugMultiPlayer ? window.sessionStorage : window.localStorage;
  }, [debugMultiPlayer]);
  const identityStorageKey = debugMultiPlayer ? "decrypto_identity_debug" : "decrypto_identity";
  const clearSession = () => {
    setState(null);
    setIdentity(null);
    identityStorage?.removeItem(identityStorageKey);
  };

  useEffect(() => {
    if (!identityStorage) {
      return;
    }
    const identityRaw = identityStorage.getItem(identityStorageKey);
    if (identityRaw) {
      try {
        const parsed = JSON.parse(identityRaw) as Identity;
        setIdentity(parsed);
      } catch {
        identityStorage.removeItem(identityStorageKey);
      }
    }

    const onUpdate = (nextState: GameView) => setState(nextState);
    const onRoomsUpdate = (rooms: JoinableRoom[]) => setAvailableRooms(rooms);
    const onSessionCleared = () => clearSession();
    socket.on("state:update", onUpdate);
    socket.on("rooms:update", onRoomsUpdate);
    socket.on("session:cleared", onSessionCleared);

    return () => {
      socket.off("state:update", onUpdate);
      socket.off("rooms:update", onRoomsUpdate);
      socket.off("session:cleared", onSessionCleared);
    };
  }, [identityStorage, identityStorageKey, socket]);

  useEffect(() => {
    socket.emit("room:list", {}, (ack: { ok: boolean; rooms?: JoinableRoom[]; error?: string }) => {
      if (!ack.ok || !ack.rooms) {
        return;
      }
      setAvailableRooms(ack.rooms);
    });
  }, [socket]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    socket.emit("room:reconnect", identity, (ack: { ok: boolean; error?: string }) => {
      if (!ack.ok) {
        setError(ack.error ?? "Reconnect failed");
      }
    });
  }, [identity, socket]);

  const createRoom = (nickname: string, targetPlayerCount: 4 | 6 | 8): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit(
        "room:create",
        { nickname, targetPlayerCount },
        (ack: { ok: boolean; roomId?: string; playerId?: string; error?: string }) => {
          if (!ack.ok || !ack.roomId || !ack.playerId) {
            reject(new Error(ack.error ?? "Create room failed"));
            return;
          }
          const nextIdentity = { roomId: ack.roomId, playerId: ack.playerId };
          setIdentity(nextIdentity);
          identityStorage?.setItem(identityStorageKey, JSON.stringify(nextIdentity));
          resolve();
        }
      );
    });
  };

  const joinRoom = (nickname: string, roomId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit("room:join", { nickname, roomId }, (ack: { ok: boolean; roomId?: string; playerId?: string; error?: string }) => {
        if (!ack.ok || !ack.roomId || !ack.playerId) {
          reject(new Error(ack.error ?? "Join room failed"));
          return;
        }
        const nextIdentity = { roomId: ack.roomId, playerId: ack.playerId };
        setIdentity(nextIdentity);
        identityStorage?.setItem(identityStorageKey, JSON.stringify(nextIdentity));
        resolve();
      });
    });
  };

  const startGame = (): Promise<void> => {
    if (!identity) {
      return Promise.reject(new Error("Not in room"));
    }
    return emitWithAck("game:start", identity);
  };

  const leaveRoom = async (): Promise<void> => {
    if (!identity) {
      throw new Error("Not in room");
    }
    await emitWithAck("room:leave", identity);
    clearSession();
    await refreshJoinableRooms();
  };

  const disbandRoom = async (): Promise<void> => {
    if (!identity) {
      throw new Error("Not in room");
    }
    await emitWithAck("room:disband", identity);
    clearSession();
    await refreshJoinableRooms();
  };

  const submitClues = (clues: [string, string, string]): Promise<void> => {
    if (!identity) {
      return Promise.reject(new Error("Not in room"));
    }
    return emitWithAck("speaker:submit", { ...identity, clues });
  };

  const submitGuess = (targetTeamId: string, guess: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]): Promise<void> => {
    if (!identity) {
      return Promise.reject(new Error("Not in room"));
    }
    return emitWithAck("guess:submit", { ...identity, targetTeamId, guess });
  };

  const aiAction = async (teamId: string): Promise<[string, string, string]> => {
    if (!identity) {
      throw new Error("Not in room");
    }
    return new Promise((resolve, reject) => {
      socket.emit("ai:action", { ...identity, teamId }, (ack: { ok: boolean; clues?: [string, string, string]; error?: string }) => {
        if (!ack.ok || !ack.clues) {
          reject(new Error(ack.error ?? "AI action failed"));
          return;
        }
        resolve(ack.clues);
      });
    });
  };

  const emitWithAck = (event: string, payload: object): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, ((ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) {
          setError(ack.error ?? "Request failed");
          reject(new Error(ack.error ?? "Request failed"));
          return;
        }
        setError("");
        resolve();
      }) as Ack<Record<string, never>>);
    });
  };

  const refreshJoinableRooms = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      socket.emit("room:list", {}, (ack: { ok: boolean; rooms?: JoinableRoom[]; error?: string }) => {
        if (!ack.ok || !ack.rooms) {
          reject(new Error(ack.error ?? "Load rooms failed"));
          return;
        }
        setAvailableRooms(ack.rooms);
        resolve();
      });
    });
  };

  return {
    state,
    availableRooms,
    error,
    debugMultiPlayer,
    identity,
    createRoom,
    joinRoom,
    startGame,
    leaveRoom,
    disbandRoom,
    submitClues,
    submitGuess,
    aiAction,
    refreshJoinableRooms
  };
};
