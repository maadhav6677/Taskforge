import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from '../../config/env.js';
import { verifyAccessToken } from '../../modules/auth/access-token.js';
import { authCookieNames } from '../../modules/auth/auth.cookies.js';
import { redis } from '../redis/redis.js';
import { taskStatusChannel, taskStatusEventSchema } from './task-events.js';

const cookieValue = (header: string | undefined, name: string): string | undefined =>
  header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const startSocketServer = async (server: HttpServer) => {
  const origins = env.API_CORS_ORIGINS.split(',').map((origin) => origin.trim());
  const io = new SocketServer(server, { cors: { origin: origins, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const raw = cookieValue(socket.handshake.headers.cookie, authCookieNames.access);
      if (!raw) throw new Error('Missing access cookie.');
      const principal = await verifyAccessToken(decodeURIComponent(raw));
      socket.data.principal = principal;
      next();
    } catch {
      next(new Error('Authentication required.'));
    }
  });
  io.on('connection', (socket) => {
    const principal = socket.data.principal as { sub: string; role: 'USER' | 'ADMIN' };
    void socket.join(principal.role === 'ADMIN' ? 'admins' : `user:${principal.sub}`);
  });

  const subscriber = redis.duplicate();
  try {
    await subscriber.connect();
    await subscriber.subscribe(taskStatusChannel);
  } catch (error) {
    subscriber.disconnect();
    await io.close();
    throw error;
  }
  subscriber.on('message', (_channel, raw) => {
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const parsed = taskStatusEventSchema.safeParse(value);
    if (!parsed.success) return;
    const publicEvent = {
      taskId: parsed.data.taskId,
      status: parsed.data.status,
      executionVersion: parsed.data.executionVersion,
      occurredAt: parsed.data.occurredAt,
    };
    io.to(`user:${parsed.data.ownerId}`).to('admins').emit('task.status.changed', publicEvent);
  });

  return async (): Promise<void> => {
    await subscriber.quit();
    await io.close();
  };
};
