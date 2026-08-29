import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
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
 * POST /api/upload
 * Expects single audio file with field name 'audio'
 */
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
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

    // Save to MongoDB "pulsR" database (if connected)
    try {
      await Track.create(trackInfo);
    } catch (dbErr) {
      console.warn('Notice: Could not persist track to MongoDB:', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      track: trackInfo
    });
  } catch (err) {
    console.error('Error during file upload:', err);
    return res.status(500).json({ error: 'Failed to process audio file' });
  }
});

/**
 * GET /api/tracks
 * Returns history of uploaded tracks from MongoDB
 */
router.get('/tracks', async (req, res) => {
  try {
    const tracks = await Track.find().sort({ createdAt: -1 }).limit(20);
    return res.json({ success: true, tracks });
  } catch (err) {
    return res.json({ success: true, tracks: [] });
  }
});

export default router;
