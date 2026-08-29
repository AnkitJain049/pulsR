import { roomManager } from './roomManager.js';
import { generateSessionId, generateFunnyUsername } from './utils.js';

/**
 * Broadcast a JSON payload to all connected clients in a specific room
 */
export function broadcastToRoom(room, payload) {
  if (!room || !room.clients) return;
  const message = JSON.stringify(payload);
  for (const socket of room.clients.keys()) {
    if (socket.readyState === 1) { // 1 = WebSocket.OPEN
      socket.send(message);
    }
  }
}

/**
 * Broadcast a JSON payload to a room by room ID
 */
export function broadcastToRoomId(roomId, payload) {
  const room = roomManager.getRoom(roomId);
  if (room) {
    broadcastToRoom(room, payload);
  }
}

/**
 * Broadcast current room state & PEERS_UPDATE to all room members
 */
export function broadcastRoomState(room) {
  if (!room) return;
  const formattedState = roomManager.formatRoomState(room);
  
  // Broadcast full ROOM_STATE
  broadcastToRoom(room, {
    type: 'ROOM_STATE',
    room: formattedState
  });

  // Broadcast PEERS_UPDATE
  broadcastToRoom(room, {
    type: 'PEERS_UPDATE',
    payload: {
      clients: formattedState.clients,
      clientCount: formattedState.clientCount
    }
  });
}

/**
 * Initialize WebSocket Event Handler on WS Server
 */
export function setupWebSocketHandler(wss) {
  wss.on('connection', (socket) => {
    // Generate initial session state for socket
    let sessionId = generateSessionId();
    let username = generateFunnyUsername();
    let currentRoomId = null;

    // Send initial session handshake
    socket.send(JSON.stringify({
      type: 'SESSION_INIT',
      payload: { sessionId, username }
    }));

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const { type, payload } = message;

        switch (type) {
          case 'SYNC_PING': {
            const clientSendTime = payload?.clientSendTime || payload?.clientTime || Date.now();
            const serverTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            
            socket.send(JSON.stringify({
              type: 'SYNC_PONG',
              clientSendTime,
              serverTime,
              payload: {
                clientTime: clientSendTime,
                serverTime: Date.now()
              }
            }));
            break;
          }

          case 'JOIN_ROOM': {
            const reqRoomId = payload?.roomId?.trim().toUpperCase();
            if (payload?.sessionId) sessionId = payload.sessionId;
            if (payload?.username) username = payload.username;

            const room = roomManager.getRoom(reqRoomId);
            if (!room) {
              socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: `Room "${reqRoomId}" not found.` }
              }));
              break;
            }

            const joinResult = roomManager.joinRoom(reqRoomId, socket, sessionId, username);
            currentRoomId = room.id;
            const assignedRole = joinResult.clientData.role;
            const assignedUsername = joinResult.clientData.username;
            const formattedRoom = roomManager.formatRoomState(room);

            // 1. Send INIT_STATE to joining socket
            socket.send(JSON.stringify({
              type: 'INIT_STATE',
              payload: {
                role: assignedRole,
                username: assignedUsername,
                roomState: formattedRoom
              }
            }));

            // Also send ROOM_JOINED for backward compatibility
            socket.send(JSON.stringify({
              type: 'ROOM_JOINED',
              payload: {
                roomId: room.id,
                role: assignedRole,
                roomState: formattedRoom
              }
            }));

            // 2. Broadcast PEERS_UPDATE & ROOM_STATE to all room members
            broadcastRoomState(room);
            break;
          }

          case 'CREATE_ROOM': {
            if (payload?.username) username = payload.username;
            if (payload?.sessionId) sessionId = payload.sessionId;

            const room = roomManager.createRoom(sessionId);
            const joinResult = roomManager.joinRoom(room.id, socket, sessionId, username);
            currentRoomId = room.id;
            const formattedRoom = roomManager.formatRoomState(room);

            socket.send(JSON.stringify({
              type: 'ROOM_CREATED',
              payload: {
                roomId: room.id,
                role: joinResult.clientData.role,
                roomState: formattedRoom
              }
            }));

            socket.send(JSON.stringify({
              type: 'INIT_STATE',
              payload: {
                role: joinResult.clientData.role,
                username: joinResult.clientData.username,
                roomState: formattedRoom
              }
            }));

            broadcastRoomState(room);
            break;
          }

          case 'UPDATE_PROFILE': {
            if (payload?.username) {
              username = payload.username.trim();
            }
            if (payload?.sessionId) {
              sessionId = payload.sessionId;
            }
            if (currentRoomId) {
              const room = roomManager.getRoom(currentRoomId);
              if (room && room.clients.has(socket)) {
                const clientData = room.clients.get(socket);
                clientData.username = username;
                broadcastRoomState(room);
              }
            }
            break;
          }

          case 'UPDATE_TRACK': {
            if (!currentRoomId) break;
            const room = roomManager.getRoom(currentRoomId);
            if (!room) break;

            const clientData = room.clients.get(socket);
            if (clientData?.role !== 'ADMIN' && clientData?.role !== 'admin') {
              socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Only the room host can change tracks.' }
              }));
              break;
            }

            roomManager.setRoomTrack(currentRoomId, payload.track);
            broadcastRoomState(room);
            break;
          }

          case 'PLAY': {
            if (!currentRoomId) break;
            const room = roomManager.getRoom(currentRoomId);
            if (!room) break;

            const clientData = room.clients.get(socket);
            if (clientData?.role !== 'ADMIN' && clientData?.role !== 'admin') {
              socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Only the room host can control playback.' }
              }));
              break;
            }

            const offset = payload?.trackOffset ?? room.playback.trackOffset;
            roomManager.updatePlayback(currentRoomId, {
              isPlaying: true,
              trackOffset: offset
            });

            broadcastRoomState(room);
            break;
          }

          case 'PAUSE': {
            if (!currentRoomId) break;
            const room = roomManager.getRoom(currentRoomId);
            if (!room) break;

            const clientData = room.clients.get(socket);
            if (clientData?.role !== 'ADMIN' && clientData?.role !== 'admin') {
              socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Only the room host can control playback.' }
              }));
              break;
            }

            const offset = payload?.trackOffset ?? room.playback.trackOffset;
            roomManager.updatePlayback(currentRoomId, {
              isPlaying: false,
              trackOffset: offset
            });

            broadcastRoomState(room);
            break;
          }

          case 'SEEK': {
            if (!currentRoomId) break;
            const room = roomManager.getRoom(currentRoomId);
            if (!room) break;

            const clientData = room.clients.get(socket);
            if (clientData?.role !== 'ADMIN' && clientData?.role !== 'admin') {
              socket.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: 'Only the room host can seek.' }
              }));
              break;
            }

            const offset = payload?.trackOffset ?? 0;
            roomManager.updatePlayback(currentRoomId, {
              isPlaying: room.playback.isPlaying,
              trackOffset: offset
            });

            broadcastRoomState(room);
            break;
          }

          case 'LEAVE_ROOM': {
            if (currentRoomId) {
              const leaveResult = roomManager.leaveRoom(socket);
              if (leaveResult?.room) {
                broadcastRoomState(leaveResult.room);
              }
              currentRoomId = null;
            }
            socket.send(JSON.stringify({
              type: 'ROOM_LEFT',
              payload: { success: true }
            }));
            break;
          }

          default:
            console.warn('Unknown WS message type:', type);
        }
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    });

    socket.on('close', () => {
      if (currentRoomId) {
        const leaveResult = roomManager.leaveRoom(socket);
        if (leaveResult?.room) {
          broadcastRoomState(leaveResult.room);
        }
      }
    });

    socket.on('error', (err) => {
      console.error('WebSocket client error:', err);
    });
  });
}
