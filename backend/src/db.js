import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Connect to MongoDB database "pulsR"
 */
export async function connectDB() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pulsR';

  try {
    const conn = await mongoose.connect(mongoURI, {
      dbName: 'pulsR', // Explicitly targets database 'pulsR'
      serverSelectionTimeoutMS: 5000 // 5 sec timeout
    });
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (err) {
    console.warn(`⚠️  MongoDB Connection Warning: ${err.message}`);
    console.warn(`ℹ️  Continuing with in-memory room & track management fallback.`);
    return false;
  }
}
