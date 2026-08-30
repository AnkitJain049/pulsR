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

  // Live audio chunk state for listeners
  const [latestLiveChunk, setLatestLiveChunk] = useState(null);

  const socketRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const syncSamplesRef = useRef([]); // Rolling buffer of last 15 RTT & Offset samples

  // Trigger rapid burst of pings to lock high-precision clock sync quickly
  const triggerRapidSync = useCallback((ws) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let pings = 0;
    const sendPing = () => {
      if (pings >= 5 || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: 'SYNC_PING',
        clientSendTime: Date.now(),
        payload: { clientTime: Date.now() }
      }));
      pings++;
      if (pings < 5) setTimeout(sendPing, 50);
    };
    sendPing();
  }, []);

  // Connect to WebSocket Server
  useEffect(() => {
    let isSubscribed = true;
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      if (!isSubscribed) return;
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

      // Initial rapid burst ping for fast clock lock
      triggerRapidSync(ws);

      // Periodic latency sync ping every 2 seconds
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
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
      if (!isSubscribed) return;
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
            if (socketRef.current) triggerRapidSync(socketRef.current);
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

          case 'LIVE_AUDIO_CHUNK': {
            if (payload?.chunk) {
              setLatestLiveChunk(payload);
            }
            break;
          }

          case 'LIVE_BROADCAST_STARTED': {
            setRoomState(prev => prev ? { ...prev, isLiveBroadcast: true, liveMimeType: payload.mimeType } : prev);
            break;
          }

          case 'LIVE_BROADCAST_STOPPED': {
            setRoomState(prev => prev ? { ...prev, isLiveBroadcast: false } : prev);
            setLatestLiveChunk(null);
            break;
          }

          case 'SYNC_PONG': {
            const now = Date.now();
            const clientSendTime = payload?.clientTime || msg.clientSendTime || now;
            const rtt = Math.max(0, now - clientSendTime);
            const oneWayLatency = rtt / 2;
            const currentLatency = Math.round(oneWayLatency);
            setLatency(currentLatency);

            const serverTime = payload?.serverTime || msg.serverTime || now;
            const estimatedServerNow = serverTime + oneWayLatency;
            const rawOffset = estimatedServerNow - now;

            // Rolling buffer for Cristian's Algorithm outlier rejection
            const samples = syncSamplesRef.current;
            samples.push({ rtt, offset: rawOffset });
            if (samples.length > 15) samples.shift();

            // Cristian's Algorithm: Sort by RTT and average lowest 30% latency samples
            const sortedByRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
            const bestCount = Math.max(1, Math.floor(sortedByRtt.length * 0.3));
            const bestSamples = sortedByRtt.slice(0, bestCount);

            const avgBestOffset = bestSamples.reduce((sum, s) => sum + s.offset, 0) / bestCount;

            // Exponential Moving Average (EMA) smoothing to eliminate cloud jitter
            setServerTimeOffset(prev => {
              if (prev === 0) return avgBestOffset;
              return Math.round(prev * 0.75 + avgBestOffset * 0.25);
            });
            break;
          }

          case 'ROOM_DISCARDED': {
            setRoomState(null);
            setRole(null);
            setError(payload?.message || 'The host has discarded this room.');
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
      if (!isSubscribed) return;
      setConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    ws.onerror = (err) => {
      if (!isSubscribed) return;
      // Suppress unmount & transient dev server socket closure warnings
      if (ws.readyState === WebSocket.CLOSED) return;
      console.warn('WebSocket connection notice:', err);
    };

    return () => {
      isSubscribed = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
  }, [triggerRapidSync]);

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
    setRoomState(null);
    setRole(null);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
  }, []);

  const discardRoom = useCallback(() => {
    setRoomState(null);
    setRole(null);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'DISCARD_ROOM' }));
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
    socketRef,
    connected,
    session,
    roomState,
    role,
    latency,
    serverTimeOffset,
    hardwareCalibration,
    setHardwareCalibration,
    latestLiveChunk,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    discardRoom,
    updateTrack,
    playTrack,
    pauseTrack,
    seekTrack,
    updateProfile
  };
}
