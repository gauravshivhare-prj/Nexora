import { logger } from '../utils/logger.js';
import { User, toPublicUser } from './User.model.js';

/**
 * Model registry and index management.
 *
 * Registering new models here keeps index creation in one place as the schema
 * set grows, one model per phase.
 */
const MODELS = [User];

/**
 * Builds every declared index before the server accepts traffic.
 *
 * Mongoose's background autoIndex is unreliable to depend on: it is commonly
 * disabled in production, and it does not report failures anywhere the caller
 * can see. The unique email index is a correctness guarantee, not an
 * optimisation — without it, two concurrent registrations can both succeed —
 * so startup waits for it and fails loudly if it cannot be created.
 */
export async function ensureModelIndexes() {
  await Promise.all(MODELS.map((model) => model.init()));
  logger.info(`Indexes ready for ${MODELS.length} model(s)`);
}

export { User, toPublicUser };
