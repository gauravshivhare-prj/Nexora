import mongoose from 'mongoose';

/**
 * Task 32 — Security & Compliance Audit Log
 *
 * Immutable ledger of security-sensitive operations:
 * - Admin inspections and data audits
 * - Self-healing and manual data reconciliation
 * - Credential and password modifications
 * - Account lockout triggers
 */

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
      enum: ['student', 'admin', 'system'],
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    resourceType: {
      type: String,
      default: null,
    },
    resourceId: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export function toPublicAuditLog(doc) {
  return {
    id: doc._id.toString(),
    actor: doc.actor?.toString() || null,
    actorRole: doc.actorRole,
    action: doc.action,
    targetUser: doc.targetUser?.toString() || null,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId,
    details: doc.details,
    createdAt: doc.createdAt,
  };
}
