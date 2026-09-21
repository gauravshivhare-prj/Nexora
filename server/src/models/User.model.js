import mongoose from 'mongoose';

import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  NAME_POLICY,
  USER_ROLES,
  USER_ROLE_VALUES,
} from '../constants/authPolicy.js';

/**
 * Account-level identity only.
 *
 * Academic details, skills, projects and career preferences belong to the
 * Student Profile in Phase 2. Keeping them out means an authentication change
 * never risks profile data, and a profile change never risks login.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [NAME_POLICY.minLength, 'Name is too short'],
      maxlength: [NAME_POLICY.maxLength, 'Name is too long'],
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      // Storage-level normalisation, mirroring normaliseEmail() at the API
      // boundary. Both exist so a future non-HTTP caller cannot bypass it.
      trim: true,
      lowercase: true,
      maxlength: [EMAIL_MAX_LENGTH, 'Email is too long'],
      match: [EMAIL_PATTERN, 'Email format is invalid'],
      // The unique index — not an application-level check — is what actually
      // prevents duplicate accounts under concurrency. See models/index.js.
      unique: true,
    },

    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      // Excluded from every query unless explicitly re-selected, so a future
      // endpoint cannot leak it by forgetting to project it away.
      select: false,
    },

    role: {
      type: String,
      enum: {
        values: USER_ROLE_VALUES,
        message: 'Role must be one of: ' + USER_ROLE_VALUES.join(', '),
      },
      default: USER_ROLES.STUDENT,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    // Provides createdAt and updatedAt.
    timestamps: true,

    toJSON: {
      /**
       * Last line of defence. The service returns an explicit DTO rather than
       * relying on this, but if a document is ever serialised directly, the
       * hash and internal fields still do not escape.
       */
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

/**
 * The public shape of a user, used by every API response.
 *
 * An allow-list, not a delete-list: a field added to the schema later is
 * invisible to clients until someone deliberately adds it here.
 */
export function toPublicUser(userDocument) {
  return {
    id: userDocument._id.toString(),
    name: userDocument.name,
    email: userDocument.email,
    role: userDocument.role,
    isActive: userDocument.isActive,
    createdAt: userDocument.createdAt,
  };
}

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
