import cors from 'cors';
import express from 'express';

import apiRoutes from './routes/index.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestId } from './middleware/requestId.js';
import { responseTiming } from './middleware/responseTiming.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { requestLogger } from './middleware/requestLogger.js';
import { securityHeaders } from './middleware/securityHeaders.js';

/**
 * Builds the Express application.
 *
 * Deliberately separate from server.js: this module wires HTTP concerns only,
 * while server.js owns process lifecycle (database, listening, shutdown).
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(responseTiming);
  app.use(metricsMiddleware);
  app.use(securityHeaders);
  const allowedOrigins = env.clientUrl?.includes(',')
    ? env.clientUrl.split(',').map((s) => s.trim()).filter(Boolean)
    : env.clientUrl;

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'X-API-Version', 'Retry-After'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
