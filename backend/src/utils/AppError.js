/**
 * Standard application error codes and their HTTP status mappings.
 */
export const ERROR_CODES = {
  UNAUTHORIZED: { status: 401, message: 'Unauthorized' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  VALIDATION_ERROR: { status: 400, message: 'Validation error' },
  SIGNAL_DUPLICATE: { status: 409, message: 'Signal already sent to this user within 24 hours' },
  SIGNAL_SELF_SEND: { status: 400, message: 'Cannot send signal to yourself' },
  SIGNAL_ALREADY_RESPONDED: { status: 409, message: 'Signal has already been responded to' },
  SIGNAL_INVALID_STATUS: { status: 409, message: 'Invalid signal status transition' },
  INSUFFICIENT_COINS: { status: 402, message: 'Insufficient coin balance' },
  MOMENT_WINDOW_EXPIRED: { status: 410, message: 'Check-in window has expired' },
  MOMENT_ALREADY_CHECKED_IN: { status: 409, message: 'Already checked in to this moment' },
  PAYMENT_INVALID: { status: 402, message: 'Payment verification failed' },
  PAYMENT_DUPLICATE: { status: 409, message: 'Duplicate payment: imp_uid already processed' },
  RATE_LIMIT_EXCEEDED: { status: 429, message: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
};

/**
 * Custom application error class.
 * All thrown errors should be instances of AppError.
 */
export class AppError extends Error {
  /**
   * @param {keyof ERROR_CODES} code - Error code key
   * @param {string} [message] - Override default message
   * @param {object} [details] - Additional details (not exposed in production)
   */
  constructor(code, message, details) {
    const entry = ERROR_CODES[code];
    if (!entry) {
      throw new Error(`Unknown error code: ${code}`);
    }
    super(message || entry.message);
    this.code = code;
    this.status = entry.status;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
