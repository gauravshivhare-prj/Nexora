import cors from 'cors';
import express from 'express';

import apiRoutes from './routes/index.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

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
  // A JSON API is never meant to be sniffed as another type or framed.
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(
    cors({
      origin: env.clientUrl,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
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
