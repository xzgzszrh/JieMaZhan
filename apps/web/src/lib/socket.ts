import { io, Socket } from "socket.io-client";

let socketSingleton: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketSingleton) {
    const configuredServerUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
    const serverUrl = configuredServerUrl && configuredServerUrl.length > 0 ? configuredServerUrl : undefined;
    socketSingleton = io(serverUrl, { transports: ["websocket"] });
  }
  return socketSingleton;
};
