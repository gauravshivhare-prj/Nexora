import { logger } from '../utils/logger.js';
import { StudentProfile, emptyProfile, toPublicProfile } from './StudentProfile.model.js';
import { User, toPublicUser } from './User.model.js';

/**
 * Model registry and index management.
 *
 * Registering new models here keeps index creation in one place as the schema
 * set grows, one model per phase.
 */
const MODELS = [User, StudentProfile];

/**
 * Builds every declared index before the server accepts traffic.
 *
 * Mongoose's background autoIndex is unreliable to depend on: it is commonly
 * disabled in production, and it does not report failures anywhere the caller
 * can see. The unique indexes here are correctness guarantees, not
 * optimisations — without them two concurrent registrations can both create an
 * account, and two concurrent first saves can both create a profile — so
 * startup waits for them and fails loudly if they cannot be created.
 */
export async function ensureModelIndexes() {
  await Promise.all(MODELS.map((model) => model.init()));
  logger.info(`Indexes ready for ${MODELS.length} model(s)`);
}

export { StudentProfile, User, emptyProfile, toPublicProfile, toPublicUser };
