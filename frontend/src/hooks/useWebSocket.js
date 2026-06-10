import { useEffect, useRef, useState } from "react";
import { getToken } from "../services/api";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// Deriva la URL del WS desde la base del API (quita /api, http->ws).
function buildWsUrl() {
  const base = API_BASE.replace(/\/api\/?$/, "");
  const wsBase = base.replace(/^http/, "ws");
  const token = getToken();
  return `${wsBase}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/**
 * Conecta al WebSocket de tiempo real y llama onMessage con cada update.
 * Reintenta la conexión automáticamente. Si el WS falla, el caller mantiene
 * su polling como fallback.
 */
export function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(buildWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlerRef.current?.(data);
        } catch {
          /* ignora mensajes no-JSON */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 4000);
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return { connected };
}
