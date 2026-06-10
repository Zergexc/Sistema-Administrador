import { useEffect, useRef } from "react";

/**
 * Suscribe a los mensajes WebSocket re-emitidos por el Layout (evento "ti:ws").
 * Permite que cada página refresque sus datos en tiempo real sin abrir su
 * propia conexión.
 */
export function useWsEvent(callback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const handler = (e) => cbRef.current?.(e.detail);
    window.addEventListener("ti:ws", handler);
    return () => window.removeEventListener("ti:ws", handler);
  }, []);
}
