import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  adminSessionId: { type: String, required: true },
  track: {
    id: String,
    originalName: String,
    filename: String,
    url: String,
    duration: Number,
    size: Number
  },
  playback: {
    isPlaying: { type: Boolean, default: false },
    trackOffset: { type: Number, default: 0 },
    serverStartTime: { type: Number, default: 0 }
  },
  activeClientsCount: { type: Number, default: 1 },
  lastActiveAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export const Room = mongoose.model('Room', roomSchema);
