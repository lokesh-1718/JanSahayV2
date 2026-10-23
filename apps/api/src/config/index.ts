import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civicaid',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',

  // Simulation / demo tuning
  claimWindowSeconds: 180,      // 3 min live, 30s demo
  heartbeatTimeoutSeconds: 60,
  watchdogIntervalMs: 5_000,    // check stale riders every 5s
  safetyBufferMinutes: 5,
} as const;
