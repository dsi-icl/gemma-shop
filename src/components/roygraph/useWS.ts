import { useEffect, useState } from "react";
import { getWS } from "./ws";

export function useWS() {
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const socket = getWS();
      socket.onclose = () => {
        setTimeout(connect, 1000)
      };
      socket.onerror = () => {
        setTimeout(connect, 1000)
      };
      setWs(socket);
      return () => {
        socket.close();
        setWs(null);
      };
    }
    connect();
  }, [ws]);

  return ws;
} 