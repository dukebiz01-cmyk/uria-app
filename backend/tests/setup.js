/**
 * Jest Test Setup
 *
 * Sets required environment variables before any test runs.
 * Uses a separate test DB and Redis DB to avoid polluting development data.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://uria_user:uria_pass@localhost:5432/uria_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.REDIS_KEY_PREFIX = 'uria_test:';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars!!';
process.env.JWT_ACCESS_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.ADMIN_SECRET = 'test-admin-secret-min-16-ch';
process.env.PORT = '3001';
process.env.PORTONE_API_SECRET = 'test-portone-secret';
process.env.PORTONE_WEBHOOK_SECRET = 'test-webhook-secret';
