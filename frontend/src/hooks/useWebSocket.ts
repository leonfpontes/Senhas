/**
 * useWebSocket - Real-time WebSocket hook for door queue updates
 */
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
  /** WebSocket URL */
  url: string;
  /** Called when a message is received */
  onMessage?: (event: string, data: any) => void;
  /** Auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Reconnect interval in ms */
  reconnectInterval?: number;
}

export function useWebSocket({
  url,
  onMessage,
  reconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!url) {
      setConnected(false);
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
        console.debug('[WS] Connected:', url);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          onMessageRef.current?.(msg.event, msg.data);
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.debug('[WS] Disconnected');
        if (reconnect && shouldReconnectRef.current) {
          reconnectTimer.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = (err) => {
        console.warn('[WS] Error:', err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.warn('[WS] Connection failed:', err);
      if (reconnect && shouldReconnectRef.current) {
        reconnectTimer.current = setTimeout(connect, reconnectInterval);
      }
    }
  }, [url, reconnect, reconnectInterval]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  // Ping to keep alive every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return { connected };
}
