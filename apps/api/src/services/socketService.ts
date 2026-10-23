import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { REALTIME_EVENTS, ROOMS, type RealtimeEvent, type RealtimePayload } from '@civicaid/shared';
import { config } from '../config/index.js';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [config.clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Automatically join the operations room for global dispatch updates
    socket.join(ROOMS.operations);

    socket.on('join:room', (room: string) => {
      if (typeof room === 'string') {
        socket.join(room);
      }
    });

    socket.on('leave:room', (room: string) => {
      if (typeof room === 'string') {
        socket.leave(room);
      }
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export function emitRealtimeEvent<T = unknown>(
  event: RealtimeEvent,
  entityType: string,
  entityId: string | undefined,
  data: T,
  targetRooms: string[] = [ROOMS.operations],
): void {
  if (!io) return;

  const payload: RealtimePayload<T> = {
    event,
    entityType,
    entityId,
    data,
    timestamp: new Date().toISOString(),
  };

  targetRooms.forEach((room) => {
    io!.to(room).emit(event, payload);
  });
  // Also emit to all connected clients for fallback/general listeners
  io.emit(event, payload);
}
