import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { roomManager } from '../roomManager.js';
import { broadcastToRoomId, broadcastRoomState } from '../wsHandler.js';
import { Track } from '../models/Track.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Audio file filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files (MP3, WAV, AAC, M4A, OGG, FLAC) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size limit
});

const router = express.Router();

/**
 * POST /api/rooms
 * Accepts { adminSessionId }, creates a room, returns { roomId, role: 'ADMIN' }
 */
router.post('/rooms', (req, res) => {
  try {
    const { adminSessionId } = req.body || {};
    if (!adminSessionId) {
      return res.status(400).json({ error: 'adminSessionId is required' });
    }

    const room = roomManager.createRoom(adminSessionId);
    return res.status(201).json({
      roomId: room.id,
      role: 'ADMIN'
    });
  } catch (err) {
    console.error('Error creating room via REST:', err);
    return res.status(500).json({ error: 'Failed to create room' });
  }
});

/**
 * POST /api/rooms/:roomId/track
 * Uploads audio to /uploads, updates room.track, and broadcasts TRACK_LOADED to room sockets
 */
router.post('/rooms/:roomId/track', upload.single('audio'), async (req, res) => {
  try {
    const roomId = req.params.roomId?.trim().toUpperCase();
    const room = roomManager.getRoom(roomId);

    if (!room) {
      return res.status(404).json({ error: `Room "${roomId}" not found` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided in field "audio"' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const trackInfo = {
      id: req.file.filename,
      originalName: req.file.originalname,
      filename: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: Date.now()
    };

    // Update room track in memory & DB
    roomManager.setRoomTrack(roomId, trackInfo);

    // Save track to MongoDB "pulsR" database (if connected)
    try {
      await Track.create(trackInfo);
    } catch (dbErr) {
      // Non-blocking
    }

    // Broadcast TRACK_LOADED to all connected WebSockets in that room
    broadcastToRoomId(roomId, {
      type: 'TRACK_LOADED',
      payload: { track: trackInfo }
    });

    // Broadcast updated ROOM_STATE & PEERS_UPDATE
    broadcastRoomState(room);

    return res.status(200).json({
      success: true,
      track: trackInfo
    });
  } catch (err) {
    console.error('Error uploading track via REST:', err);
    return res.status(500).json({ error: 'Failed to upload audio track' });
  }
});

export default router;
