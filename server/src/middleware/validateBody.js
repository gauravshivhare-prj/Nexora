import { ValidationCollector } from '../utils/validation.js';

/**
 * Task 33 — Declarative Request Body Validation Middleware
 *
 * Validates request payloads against declarative schema rules before reaching controllers.
 * Provides unified, structured field-level validation errors using ValidationCollector.
 *
 * @param {Record<string, {
 *   type?: 'string' | 'number' | 'boolean' | 'array' | 'object',
 *   required?: boolean,
 *   minLength?: number,
 *   maxLength?: number,
 *   enum?: Array<any>,
 *   custom?: (value: any, body: any) => boolean | string,
 *   message?: string,
 * }>} schema
 * @param {object} [options]
 * @param {boolean} [options.allowUnknown=false]
 */
export function validateBody(schema, { allowUnknown = false } = {}) {
  return (req, _res, next) => {
    const collector = new ValidationCollector();
    const isObject =
      req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body);

    if (!isObject && Object.keys(schema).length > 0) {
      collector.add('body', 'Request body must be a JSON object');
      try {
        collector.throwIfInvalid();
      } catch (err) {
        return next(err);
      }
    }

    const body = isObject ? req.body : {};

    if (!allowUnknown) {
      const allowedKeys = new Set(Object.keys(schema));
      for (const key of Object.keys(body)) {
        if (!allowedKeys.has(key)) {
          collector.add(key, 'Is not a recognised field');
        }
      }
    }

    for (const [field, rules] of Object.entries(schema)) {
      const value = body[field];
      const isPresent = value !== undefined && value !== null && value !== '';

      if (rules.required && !isPresent) {
        collector.add(field, rules.message || `${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (rules.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== rules.type) {
            collector.add(field, rules.message || `${field} must be of type ${rules.type}`);
            continue;
          }
        }

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (rules.minLength != null && trimmed.length < rules.minLength) {
            collector.add(
              field,
              rules.message || `${field} must be at least ${rules.minLength} characters`,
            );
          }
          if (rules.maxLength != null && trimmed.length > rules.maxLength) {
            collector.add(
              field,
              rules.message || `${field} must be at most ${rules.maxLength} characters`,
            );
          }
        }

        if (rules.enum && !rules.enum.includes(value)) {
          collector.add(
            field,
            rules.message || `${field} must be one of: ${rules.enum.join(', ')}`,
          );
        }

        if (typeof rules.custom === 'function') {
          const customResult = rules.custom(value, body);
          if (customResult === false) {
            collector.add(field, rules.message || `${field} failed validation`);
          } else if (typeof customResult === 'string') {
            collector.add(field, customResult);
          }
        }
      }
    }

    try {
      collector.throwIfInvalid();
      next();
    } catch (err) {
      next(err);
    }
  };
}
