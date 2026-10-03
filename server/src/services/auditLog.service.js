import { AuditLog, toPublicAuditLog } from '../models/AuditLog.model.js';
import { logger } from '../utils/logger.js';

/**
 * Records an immutable audit log entry.
 *
 * @param {object} params
 * @param {string} params.actor User ObjectId string
 * @param {string} [params.actorRole='student']
 * @param {string} params.action E.g. 'PASSWORD_CHANGED', 'ACCOUNT_LOCKED', 'ADMIN_CONSISTENCY_AUDIT'
 * @param {string} [params.targetUser=null]
 * @param {string} [params.resourceType=null]
 * @param {string} [params.resourceId=null]
 * @param {object} [params.details={}]
 * @param {string} [params.ipAddress=null]
 * @returns {Promise<object|null>}
 */
export async function recordAuditLog({
  actor,
  actorRole = 'student',
  action,
  targetUser = null,
  resourceType = null,
  resourceId = null,
  details = {},
  ipAddress = null,
}) {
  try {
    const entry = await AuditLog.create({
      actor,
      actorRole,
      action,
      targetUser,
      resourceType,
      resourceId,
      details,
      ipAddress,
    });
    return toPublicAuditLog(entry);
  } catch (error) {
    logger.error('Failed to persist audit log entry:', error);
    return null;
  }
}

/**
 * Queries audit logs for compliance, security review, or user activity tracking.
 *
 * @param {object} [filters]
 * @param {string} [filters.targetUser]
 * @param {string} [filters.actor]
 * @param {string} [filters.action]
 * @param {number} [filters.limit=50]
 * @returns {Promise<Array<object>>}
 */
export async function listAuditLogs({
  targetUser = null,
  actor = null,
  action = null,
  limit = 50,
} = {}) {
  const query = {};
  if (targetUser) query.targetUser = targetUser;
  if (actor) query.actor = actor;
  if (action) query.action = action;

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);
  return logs.map(toPublicAuditLog);
}
