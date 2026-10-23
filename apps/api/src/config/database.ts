import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.warn('⚠️  MongoDB connection failed — server will start without DB.');
    console.warn('   Make sure MongoDB is running at:', config.mongoUri);
    console.warn('   Error:', (err as Error).message);
    // Don't exit; let the server start so health endpoint is reachable.
    // DB-dependent routes will fail gracefully at request time.
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected');
  });
}
