import { io, Socket } from "socket.io-client";

let socketSingleton: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketSingleton) {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4100";
    socketSingleton = io(serverUrl, { transports: ["websocket"] });
  }
  return socketSingleton;
};
