import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateRoomCode, generateFunnyUsername } from './utils.js';
import { Room as RoomModel } from './models/Room.js';
import { Track as TrackModel } from './models/Track.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');

/**
 * Delete a physical audio file from backend/uploads/ disk
 */
export function deleteTrackFile(filename) {
  if (!filename) return;
  try {
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted track file from disk: ${filename}`);
    }
  } catch (err) {
    console.error(`Failed to delete track file ${filename}:`, err);
  }
}

/**
 * Cleanup any orphaned audio files in uploads/ that are not linked to any active room or MongoDB record
 */
export async function cleanupOrphanedUploads() {
  try {
    if (!fs.existsSync(uploadsDir)) return;
    const diskFiles = fs.readdirSync(uploadsDir);
    
    // Get all active filenames in MongoDB
    const activeRooms = await RoomModel.find({ 'track.filename': { $exists: true } }).select('track.filename');
    const activeTracks = await TrackModel.find().select('filename');
    
    const activeFilenames = new Set([
      ...activeRooms.map(r => r.track?.filename).filter(Boolean),
      ...activeTracks.map(t => t.filename).filter(Boolean)
    ]);

    for (const file of diskFiles) {
      if (file === '.gitkeep') continue;
      if (!activeFilenames.has(file)) {
        deleteTrackFile(file);
      }
    }
  } catch (err) {
    console.error('Orphaned upload cleanup warning:', err);
  }
}

/**
 * Ephemeral In-Memory Room State Manager with MongoDB Persistence & Auto Disk Cleanup
 */
class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Persist room state to MongoDB "pulsR" database
   */
  async syncToDatabase(room) {
    if (!room) return;
    try {
      await RoomModel.findOneAndUpdate(
        { roomId: room.id },
        {
          roomId: room.id,
          adminSessionId: room.adminSessionId,
          track: room.track,
          playback: room.playback,
          activeClientsCount: room.clients.size,
          lastActiveAt: new Date()
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

    // Return if already in RAM
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
          playback: dbRoom.playback || { isPlaying: false, trackOffset: 0, serverStartTime: 0 }
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
    
    // Ensure unique 4-char room code
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
      }
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
   * @param {string} roomId 
   * @param {WebSocket} socket 
   * @param {string} sessionId 
   * @param {string} [customUsername] 
   * @returns {Promise<Object|null>} { room, clientData }
   */
  async joinRoom(roomId, socket, sessionId, customUsername) {
    let room = this.getRoom(roomId);
    if (!room) {
      // Attempt restoration from MongoDB if evicted from RAM
      room = await this.restoreFromDatabase(roomId);
    }
    if (!room) return null;

    // Generate unique room username if not provided
    let username = customUsername;
    if (!username) {
      const existingUsernames = new Set(Array.from(room.clients.values()).map(c => c.username));
      do {
        username = generateFunnyUsername();
      } while (existingUsernames.has(username));
    }

    // Determine role (ADMIN if session matches creator or empty, else LISTENER)
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
   * @param {WebSocket} socket 
   * @returns {Object|null} { room, leftClient }
   */
  leaveRoom(socket) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.clients.has(socket)) {
        const leftClient = room.clients.get(socket);
        room.clients.delete(socket);

        // If admin left and clients still exist, reassign ADMIN role to next client
        if (leftClient.role === 'ADMIN' && room.clients.size > 0) {
          const [nextSocket, nextClient] = room.clients.entries().next().value;
          nextClient.role = 'ADMIN';
          room.adminSessionId = nextClient.sessionId;
        }

        this.syncToDatabase(room);

        // Gracefully clean up empty rooms after 5 minutes of inactivity in RAM
        if (room.clients.size === 0) {
          setTimeout(() => {
            const currentRoom = this.rooms.get(roomId);
            if (currentRoom && currentRoom.clients.size === 0) {
              this.rooms.delete(roomId);
            }
          }, 5 * 60 * 1000);
        }

        return { room, leftClient };
      }
    }
    return null;
  }

  /**
   * Permanently delete room from MongoDB & RAM, and unlink physical audio file from disk
   */
  async deleteRoom(roomId) {
    if (!roomId) return null;
    const cleanId = roomId.trim().toUpperCase();
    const room = this.getRoom(cleanId);

    // Delete associated physical audio file from disk
    if (room?.track?.filename) {
      deleteTrackFile(room.track.filename);
    }

    try {
      const dbRoom = await RoomModel.findOne({ roomId: cleanId });
      if (dbRoom?.track?.filename) {
        deleteTrackFile(dbRoom.track.filename);
        try {
          await TrackModel.deleteOne({ filename: dbRoom.track.filename });
        } catch (tErr) {}
      }
      await RoomModel.deleteOne({ roomId: cleanId });
    } catch (err) {
      console.error('Error deleting room from MongoDB:', err);
    }

    if (room) {
      this.rooms.delete(cleanId);
    }

    return room;
  }

  /**
   * Update room track info & delete previous track file from disk
   */
  setRoomTrack(roomId, trackInfo) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    // Delete previous audio file if replaced
    if (room.track?.filename && room.track.filename !== trackInfo.filename) {
      deleteTrackFile(room.track.filename);
      try {
        TrackModel.deleteOne({ filename: room.track.filename }).catch(() => {});
      } catch (e) {}
    }

    room.track = trackInfo;
    room.playback = {
      isPlaying: false,
      trackOffset: 0,
      serverStartTime: 0
    };

    this.syncToDatabase(room);
    return room;
  }

  /**
   * Update playback state (play/pause/seek)
   */
  updatePlayback(roomId, { isPlaying, trackOffset, serverStartTime }) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    room.playback.isPlaying = isPlaying;
    room.playback.trackOffset = Math.max(0, trackOffset);
    room.playback.serverStartTime = isPlaying ? (serverStartTime || Date.now()) : 0;

    this.syncToDatabase(room);
    return room;
  }

  /**
   * Format room object for client JSON broadcasting
   */
  formatRoomState(room) {
    if (!room) return null;

    const clientsList = Array.from(room.clients.values()).map(c => ({
      sessionId: c.sessionId,
      username: c.username,
      role: c.role
    }));

    return {
      id: room.id,
      adminSessionId: room.adminSessionId,
      clients: clientsList,
      clientCount: clientsList.length,
      track: room.track,
      playback: {
        isPlaying: room.playback.isPlaying,
        trackOffset: room.playback.trackOffset,
        serverStartTime: room.playback.serverStartTime
      }
    };
  }
}

export const roomManager = new RoomManager();
