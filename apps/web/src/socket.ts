import { io, Socket } from 'socket.io-client';
import { REALTIME_EVENTS, ROOMS } from '@civicaid/shared';

export const socket: Socket = io('/', {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
});

export { REALTIME_EVENTS, ROOMS };
