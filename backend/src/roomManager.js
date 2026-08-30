import mongoose from 'mongoose';
import { generateRoomCode, generateFunnyUsername } from './utils.js';

// Optional MongoDB Mongoose Schema for persistent 12-hour Room TTL
const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  adminSessionId: { type: String, required: true },
  track: { type: Object, default: null },
  playback: {
    isPlaying: { type: Boolean, default: false },
    trackOffset: { type: Number, default: 0 },
    serverStartTime: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now, expires: 43200 } // Auto-delete room after 12 hours (43200 sec)
});

const RoomModel = mongoose.models.Room || mongoose.model('Room', roomSchema);

class RoomManager {
  constructor() {
    this.rooms = new Map(); // In-Memory Active Room Store { roomId -> RoomObject }
  }

  /**
   * Format room state object to send across WebSockets (strips raw WS sockets)
   * @param {Object} room 
   * @returns {Object} formatted room state
   */
  formatRoomState(room) {
    if (!room) return null;
    const clientList = Array.from(room.clients.values()).map(c => ({
      sessionId: c.sessionId,
      username: c.username,
      role: c.role
    }));

    return {
      id: room.id,
      adminSessionId: room.adminSessionId,
      track: room.track,
      playback: room.playback,
      isLiveBroadcast: Boolean(room.isLiveBroadcast),
      liveMimeType: room.liveMimeType || 'audio/webm;codecs=opus',
      clients: clientList,
      clientCount: clientList.length
    };
  }

  /**
   * Sync room state to MongoDB (non-blocking async update)
   */
  async syncToDatabase(room) {
    if (!room) return;
    try {
      if (mongoose.connection.readyState !== 1) return;
      await RoomModel.findOneAndUpdate(
        { roomId: room.id },
        {
          adminSessionId: room.adminSessionId,
          track: room.track,
          playback: room.playback
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      // Non-blocking warning if MongoDB server is offline
    }
  }

  /**
   * Restore room from MongoDB if evicted from RAM but still active within 12 hours
   */
  async restoreFromDatabase(roomId) {
    if (!roomId) return null;
    const cleanId = roomId.trim().toUpperCase();

    if (this.rooms.has(cleanId)) {
      return this.rooms.get(cleanId);
    }

    try {
      const dbRoom = await RoomModel.findOne({ roomId: cleanId });
      if (dbRoom) {
        const restoredRoom = {
          id: dbRoom.roomId,
          adminSessionId: dbRoom.adminSessionId,
          clients: new Map(),
          track: dbRoom.track || null,
          playback: dbRoom.playback || { isPlaying: false, trackOffset: 0, serverStartTime: 0 },
          isLiveBroadcast: false,
          liveMimeType: null
        };
        this.rooms.set(cleanId, restoredRoom);
        return restoredRoom;
      }
    } catch (err) {
      // Fallback
    }

    return null;
  }

  /**
   * Create a new room
   * @param {string} adminSessionId 
   * @returns {Object} room
   */
  createRoom(adminSessionId) {
    let roomId;
    let attempts = 0;
    
    do {
      roomId = generateRoomCode();
      attempts++;
    } while (this.rooms.has(roomId) && attempts < 100);

    const room = {
      id: roomId,
      adminSessionId,
      clients: new Map(),
      track: null,
      playback: {
        isPlaying: false,
        trackOffset: 0,
        serverStartTime: 0
      },
      isLiveBroadcast: false,
      liveMimeType: null
    };

    this.rooms.set(roomId, room);
    this.syncToDatabase(room);
    return room;
  }

  /**
   * Find a room by ID in RAM
   * @param {string} roomId 
   * @returns {Object|null}
   */
  getRoom(roomId) {
    if (!roomId) return null;
    const cleanId = roomId.trim().toUpperCase();
    return this.rooms.get(cleanId) || null;
  }

  /**
   * Join a room (checks RAM, then MongoDB if evicted)
   * Purges duplicate client entries matching the same sessionId upon page refresh.
   */
  async joinRoom(roomId, socket, sessionId, customUsername) {
    let room = this.getRoom(roomId);
    if (!room) {
      room = await this.restoreFromDatabase(roomId);
    }
    if (!room) return null;

    // Purge any stale client entry in room.clients with the SAME sessionId on reconnect/refresh
    for (const [existingSocket, existingClient] of room.clients.entries()) {
      if (existingClient.sessionId === sessionId || existingSocket === socket) {
        room.clients.delete(existingSocket);
        try {
          if (existingSocket !== socket && existingSocket.readyState === 1) {
            existingSocket.close();
          }
        } catch (e) {}
      }
    }

    // Generate unique room username if not provided
    let username = customUsername;
    if (!username || typeof username !== 'string' || username === '[object Object]') {
      const existingUsernames = new Set(Array.from(room.clients.values()).map(c => c.username));
      do {
        username = generateFunnyUsername();
      } while (existingUsernames.has(username));
    }

    // Determine role (ADMIN if session matches creator or room is empty)
    const isRoomAdmin = room.adminSessionId === sessionId || room.clients.size === 0;
    if (isRoomAdmin) {
      room.adminSessionId = sessionId; // Lock admin session
    }

    const role = isRoomAdmin ? 'ADMIN' : 'LISTENER';
    const clientData = { sessionId, username, role };

    room.clients.set(socket, clientData);
    this.syncToDatabase(room);
    return { room, clientData };
  }

  /**
   * Remove a socket connection from any room it belongs to
   */
  leaveRoom(socket) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.clients.has(socket)) {
        const leftClient = room.clients.get(socket);
        room.clients.delete(socket);

        // If room is completely empty, set a timer or check discard
        if (room.clients.size === 0) {
          // Keep room available in MongoDB TTL cache for 12 hours
        } else if (leftClient.role === 'ADMIN') {
          // Transfer admin role to next oldest connected client in room
          const nextClientSocket = room.clients.keys().next().value;
          if (nextClientSocket) {
            const nextClient = room.clients.get(nextClientSocket);
            nextClient.role = 'ADMIN';
            room.adminSessionId = nextClient.sessionId;
          }
        }

        this.syncToDatabase(room);
        return { room, leftClient };
      }
    }
    return null;
  }

  /**
   * Delete room permanently from RAM and MongoDB when Host discards session
   */
  async deleteRoom(roomId) {
    if (!roomId) return false;
    const cleanId = roomId.trim().toUpperCase();
    
    if (this.rooms.has(cleanId)) {
      const room = this.rooms.get(cleanId);
      room.clients.clear();
      this.rooms.delete(cleanId);
    }

    try {
      if (mongoose.connection.readyState === 1) {
        await RoomModel.deleteOne({ roomId: cleanId });
      }
    } catch (err) {
      console.error('Error deleting room from DB:', err);
    }

    return true;
  }

  /**
   * Set active track for room
   */
  setRoomTrack(roomId, trackData) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    room.track = trackData;
    room.playback = {
      isPlaying: false,
      trackOffset: 0,
      serverStartTime: 0
    };
    this.syncToDatabase(room);
    return room;
  }

  /**
   * Update playback state (PLAY / PAUSE / SEEK)
   */
  updatePlayback(roomId, playbackState) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    room.playback = {
      ...room.playback,
      ...playbackState
    };
    this.syncToDatabase(room);
    return room;
  }
}

export const roomManager = new RoomManager();
