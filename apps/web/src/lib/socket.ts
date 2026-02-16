import { io, Socket } from "socket.io-client";

let socketSingleton: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketSingleton) {
    socketSingleton = io({
      path: "/socket",
      transports: ["websocket"]
    });
  }
  return socketSingleton;
};
