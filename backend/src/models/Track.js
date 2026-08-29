import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  url: { type: String, required: true },
  size: { type: Number, required: true },
  mimeType: { type: String },
  duration: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export const Track = mongoose.model('Track', trackSchema);
