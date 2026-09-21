import { createApp } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { logger } from './src/utils/logger.js';

/**
 * Process entry point: connect dependencies, start listening, shut down cleanly.
 * Application wiring lives in src/app.js.
 */

let httpServer;

async function shutdown(reason, exitCode = 0) {
  logger.info(`Shutting down (${reason})…`);

  try {
    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('HTTP server closed');
    }
    await disconnectDatabase();
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }

  process.exit(exitCode);
}

async function start() {
  try {
    await connectDatabase();
  } catch (error) {
    // A missing database is a startup failure, not something to hide behind a
    // server that appears healthy. Report the real cause and stop.
    logger.error('Failed to connect to MongoDB — server not started', error.message);
    process.exit(1);
  }

  httpServer = createApp().listen(env.port, () => {
    logger.info(`Nexora API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  });

  httpServer.on('error', (error) => {
    logger.error('HTTP server error', error.message);
    process.exit(1);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdown('uncaughtException', 1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
