import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

/**
 * Validate request against a Zod schema.
 * Supports validating body, params, and/or query.
 *
 * @param {object} schemas - { body?, params?, query? } — each a Zod schema
 * @returns {Function} Express middleware
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const appError = new AppError(
          'VALIDATION_ERROR',
          'Request validation failed',
          err.errors,
        );
        appError.zodErrors = err.errors;
        return next(appError);
      }
      next(err);
    }
  };
}

/**
 * Shorthand for body-only validation
 */
export function validateBody(schema) {
  return validate({ body: schema });
}

/**
 * Shorthand for params-only validation
 */
export function validateParams(schema) {
  return validate({ params: schema });
}
