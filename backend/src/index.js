import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './db.js';
import uploadRouter from './routes/upload.js';
import roomsRouter from './routes/rooms.js';
import { setupWebSocketHandler } from './wsHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Connect MongoDB "pulsR" database
connectDB();

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json());

// Serve uploads statically at /uploads
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Mount REST API routes
app.use('/api', uploadRouter);
app.use('/api', roomsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PULSR Backend',
    database: 'MongoDB (pulsR)',
    time: new Date().toISOString()
  });
});

// Create HTTP Server
const server = http.createServer(app);

// Attach WebSocket Server
const wss = new WebSocketServer({ server });
setupWebSocketHandler(wss);

// Start server listening
server.listen(PORT, () => {
  console.log(`⚡ PULSR Backend running at http://localhost:${PORT}`);
  console.log(`📁 Serving audio uploads at http://localhost:${PORT}/uploads`);
  console.log(`🔌 WebSocket server active on ws://localhost:${PORT}`);
});
