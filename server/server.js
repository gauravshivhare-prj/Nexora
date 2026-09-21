import { createApp } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { env } from './src/config/env.js';
import { ensureModelIndexes } from './src/models/index.js';
import { createGeminiProvider } from './src/services/ai/geminiProvider.js';
import { registerAiProvider } from './src/services/ai/aiProvider.js';
import { logger } from './src/utils/logger.js';

/**
 * Process entry point: connect dependencies, start listening, shut down cleanly.
 * Application wiring lives in src/app.js.
 */

let httpServer;

function registerProviders() {
  if (env.aiProviderName === 'gemini') {
    if (!env.geminiApiKey) {
      throw new Error(
        'AI_PROVIDER is set to "gemini", but GEMINI_API_KEY is not configured.',
      );
    }
    const provider = createGeminiProvider({
      apiKey: env.geminiApiKey,
      model: env.geminiModel,
      timeoutMs: env.geminiTimeoutMs,
    });
    registerAiProvider(provider);
    logger.info(`AI provider "${provider.name}" registered for model "${env.geminiModel}"`);
  }
}

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
    // Indexes before traffic: the unique email index is what prevents
    // duplicate accounts, so serving requests without it would be unsafe.
    await ensureModelIndexes();
  } catch (error) {
    // A missing database is a startup failure, not something to hide behind a
    // server that appears healthy. Report the real cause and stop.
    logger.error('Failed to prepare MongoDB — server not started', error.message);
    process.exit(1);
  }

  try {
    registerProviders();
  } catch (error) {
    logger.error('Failed to configure AI provider — server not started', error.message);
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
