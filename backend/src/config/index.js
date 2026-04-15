import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // PostgreSQL
  DATABASE_URL: z.string().url(),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('uria:'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Admin
  ADMIN_SECRET: z.string().min(16),

  // KMC PASS OTP
  KMC_API_URL: z.string().url().default('https://api.kmc.co.kr'),
  KMC_API_KEY: z.string().default(''),
  KMC_API_SECRET: z.string().default(''),

  // Firebase FCM
  FIREBASE_PROJECT_ID: z.string().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().default(''),
  FIREBASE_PRIVATE_KEY: z.string().default(''),

  // AWS S3
  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_NAME: z.string().default('uria-media'),
  S3_CDN_URL: z.string().default(''),

  // PortOne
  PORTONE_API_SECRET: z.string().default(''),
  PORTONE_WEBHOOK_SECRET: z.string().default(''),
  PORTONE_CHANNEL_KEY: z.string().default(''),
  PORTONE_BASE_URL: z.string().default('https://api.portone.io'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(60),

  // Business Config
  SIGNAL_ESCROW_COINS: z.coerce.number().default(3),
  SIGNAL_EXPIRY_HOURS: z.coerce.number().default(24),
  MOMENT_CHECKIN_WINDOW_MINUTES: z.coerce.number().default(30),
  MOMENT_GPS_ACCURACY_THRESHOLD: z.coerce.number().default(100),
});

let config;

try {
  config = envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const missing = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    console.error(`[Config] Environment variable validation failed:\n${missing}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    // In dev/test, use defaults where possible
    config = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://uria_user:uria_pass@localhost:5432/uria_db',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-minimum-32-chars!!',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-minimum-32-chars!!',
      ADMIN_SECRET: process.env.ADMIN_SECRET || 'dev-admin-secret-min-16-ch',
      ...process.env,
    });
  } else {
    throw err;
  }
}

export default config;
