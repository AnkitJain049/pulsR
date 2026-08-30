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

// Get stored username from localStorage
function getStoredUsername() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('pulsr_username') || '';
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(() => ({
    sessionId: getStoredSessionId(),
    username: getStoredUsername()
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

      // Send existing stored profile (sessionId + username) on reconnect
      const storedId = getStoredSessionId();
      const storedUsername = getStoredUsername();
      if (storedId || storedUsername) {
        ws.send(JSON.stringify({
          type: 'UPDATE_PROFILE',
          payload: { sessionId: storedId, username: storedUsername }
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
            const activeSessionId = getStoredSessionId() || payload.sessionId;
            const storedUser = getStoredUsername();
            const activeUsername = storedUser || payload.username || session.username;

            localStorage.setItem('pulsr_session_id', activeSessionId);
            if (activeUsername) {
              localStorage.setItem('pulsr_username', activeUsername);
            }

            setSession({
              sessionId: activeSessionId,
              username: activeUsername
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

            if (assignedRoomState?.id) {
              localStorage.setItem('pulsr_active_room', assignedRoomState.id);
            }

            if (payload.username) {
              localStorage.setItem('pulsr_username', payload.username);
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

            // Sort samples by lowest RTT (best latency network conditions)
            const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
            // Select median offset from top 50% lowest RTT samples
            const bestHalf = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)));
            const medianOffset = bestHalf[Math.floor(bestHalf.length / 2)].offset;

            setServerTimeOffset(medianOffset);
            break;
          }

          case 'ROOM_DISCARDED': {
            setError(payload.message || 'Room has been discarded.');
            localStorage.removeItem('pulsr_active_room');
            setRoomState(null);
            setRole(null);
            break;
          }

          case 'ROOM_LEFT': {
            localStorage.removeItem('pulsr_active_room');
            setRoomState(null);
            setRole(null);
            break;
          }

          case 'ERROR': {
            setError(payload.message || 'WebSocket Error');
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      if (isSubscribed) {
        setConnected(false);
      }
    };

    ws.onerror = (err) => {
      if (isSubscribed) {
        console.error('WebSocket Error:', err);
        setError('Connection to server lost. Retrying...');
      }
    };

    return () => {
      isSubscribed = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [triggerRapidSync]);

  // Actions
  const createRoom = useCallback((customUsername) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const activeUsername = customUsername || session.username || getStoredUsername();
    if (activeUsername) {
      localStorage.setItem('pulsr_username', activeUsername);
    }
    socketRef.current.send(JSON.stringify({
      type: 'CREATE_ROOM',
      payload: {
        sessionId: session.sessionId,
        username: activeUsername
      }
    }));
  }, [session.sessionId, session.username]);

  const joinRoom = useCallback((roomId, customUsername) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !roomId) return;
    const activeUsername = customUsername || session.username || getStoredUsername();
    if (activeUsername) {
      localStorage.setItem('pulsr_username', activeUsername);
    }
    localStorage.setItem('pulsr_active_room', roomId.trim().toUpperCase());
    socketRef.current.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: {
        roomId: roomId.trim().toUpperCase(),
        sessionId: session.sessionId,
        username: activeUsername
      }
    }));
  }, [session.sessionId, session.username]);

  const leaveRoom = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    localStorage.removeItem('pulsr_active_room');
    socketRef.current.send(JSON.stringify({
      type: 'LEAVE_ROOM'
    }));
    setRoomState(null);
    setRole(null);
  }, []);

  const discardRoom = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    localStorage.removeItem('pulsr_active_room');
    socketRef.current.send(JSON.stringify({
      type: 'DISCARD_ROOM'
    }));
    setRoomState(null);
    setRole(null);
  }, []);

  const updateTrack = useCallback((trackData) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'UPDATE_TRACK',
      payload: { track: trackData }
    }));
  }, []);

  const playTrack = useCallback((offset = 0) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'PLAY',
      payload: { trackOffset: offset }
    }));
  }, []);

  const pauseTrack = useCallback((offset = 0) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'PAUSE',
      payload: { trackOffset: offset }
    }));
  }, []);

  const seekTrack = useCallback((offset = 0) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'SEEK',
      payload: { trackOffset: offset }
    }));
  }, []);

  const updateProfile = useCallback((newUsername) => {
    if (!newUsername) return;
    const cleanUsername = newUsername.trim();
    localStorage.setItem('pulsr_username', cleanUsername);
    setSession(prev => ({ ...prev, username: cleanUsername }));

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UPDATE_PROFILE',
        payload: { username: cleanUsername, sessionId: session.sessionId }
      }));
    }
  }, [session.sessionId]);

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
