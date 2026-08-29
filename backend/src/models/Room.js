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
  lastActiveAt: { 
    type: Date, 
    default: Date.now, 
    expires: 43200 // 12 Hours TTL index: MongoDB automatically purges rooms after 12 hours of inactivity
  }
}, {
  timestamps: true
});

export const Room = mongoose.model('Room', roomSchema);
