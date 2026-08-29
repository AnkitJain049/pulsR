import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../utils/config';

// Get or auto-generate persistent sessionId from localStorage
function getStoredSessionId() {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('pulsr_session_id');
  if (!id) {
    id = 'sess_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('pulsr_session_id', id);
  }
  return id;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(() => ({
    sessionId: getStoredSessionId(),
    username: ''
  }));
  const [roomState, setRoomState] = useState(null);
  const [role, setRole] = useState(null);
  const [latency, setLatency] = useState(0);
  const [serverTimeOffset, setServerTimeOffset] = useState(0); // serverTime - clientTime
  const [hardwareCalibration, setHardwareCalibration] = useState(0); // -200ms to +200ms
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Connect to WebSocket Server
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);

      // Send existing stored sessionId if available
      const storedId = getStoredSessionId();
      if (storedId) {
        ws.send(JSON.stringify({
          type: 'UPDATE_PROFILE',
          payload: { sessionId: storedId }
        }));
      }

      // Start periodic latency sync ping every 2 seconds using Date.now() ms
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'SYNC_PING',
            clientSendTime: Date.now(),
            payload: { clientTime: Date.now() }
          }));
        }
      }, 2000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, payload } = msg;

        switch (type) {
          case 'SESSION_INIT': {
            const activeSessionId = session.sessionId || payload.sessionId;
            localStorage.setItem('pulsr_session_id', activeSessionId);
            setSession({
              sessionId: activeSessionId,
              username: payload.username || session.username
            });
            break;
          }

          case 'INIT_STATE':
          case 'ROOM_CREATED':
          case 'ROOM_JOINED': {
            const assignedRole = payload.role;
            const assignedRoomState = payload.roomState;
            setRole(assignedRole);
            setRoomState(assignedRoomState);
            if (payload.username) {
              setSession(prev => ({ ...prev, username: payload.username }));
            }
            setError(null);
            break;
          }

          case 'ROOM_STATE': {
            setRoomState(msg.room || payload?.roomState || payload);
            break;
          }

          case 'PEERS_UPDATE': {
            setRoomState(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                clients: payload.clients,
                clientCount: payload.clientCount
              };
            });
            break;
          }

          case 'TRACK_LOADED': {
            setRoomState(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                track: payload.track,
                playback: { isPlaying: false, trackOffset: 0, serverStartTime: 0 }
              };
            });
            break;
          }

          case 'SYNC_PONG': {
            const now = Date.now();
            const clientSendTime = payload?.clientTime || msg.clientSendTime || now;
            const rtt = Math.max(0, now - clientSendTime);
            const currentLatency = Math.round(rtt / 2);
            setLatency(currentLatency);

            const serverTime = payload?.serverTime || msg.serverTime || now;
            const estimatedServerNow = serverTime + currentLatency;
            const offset = estimatedServerNow - now;
            setServerTimeOffset(offset);
            break;
          }

          case 'ROOM_LEFT': {
            setRoomState(null);
            setRole(null);
            break;
          }

          case 'ERROR': {
            setError(payload?.message || 'WebSocket Error');
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
      setError('Could not connect to PULSR audio server.');
    };

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  // Action methods
  const createRoom = useCallback(() => {
    const activeSessionId = getStoredSessionId();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'CREATE_ROOM',
        payload: { sessionId: activeSessionId, username: session.username }
      }));
    }
  }, [session.username]);

  const joinRoom = useCallback((roomId) => {
    const activeSessionId = getStoredSessionId();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomId, sessionId: activeSessionId, username: session.username }
      }));
    }
  }, [session.username]);

  const leaveRoom = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
  }, []);

  const updateTrack = useCallback((track) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UPDATE_TRACK',
        payload: { track }
      }));
    }
  }, []);

  const playTrack = useCallback((offset = 0) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'PLAY',
        payload: { trackOffset: offset }
      }));
    }
  }, []);

  const pauseTrack = useCallback((offset = 0) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'PAUSE',
        payload: { trackOffset: offset }
      }));
    }
  }, []);

  const seekTrack = useCallback((offset = 0) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'SEEK',
        payload: { trackOffset: offset }
      }));
    }
  }, []);

  const updateProfile = useCallback((newUsername) => {
    setSession(prev => ({ ...prev, username: newUsername }));
    const activeSessionId = getStoredSessionId();
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UPDATE_PROFILE',
        payload: { username: newUsername, sessionId: activeSessionId }
      }));
    }
  }, []);

  return {
    connected,
    session,
    roomState,
    role,
    latency,
    serverTimeOffset,
    hardwareCalibration,
    setHardwareCalibration,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    updateTrack,
    playTrack,
    pauseTrack,
    seekTrack,
    updateProfile
  };
}
