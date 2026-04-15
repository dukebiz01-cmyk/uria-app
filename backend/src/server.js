import http from 'http';
import app from './app.js';
import config from './config/index.js';
import pool from './config/db.js';
import redis from './config/redis.js';
import { attachWsServer } from './modules/chat/chat.ws.js';
import { startSignalExpiryJob } from './jobs/signalExpiry.job.js';
import { startMomentExpiryJob } from './jobs/momentExpiry.job.js';
import logger from './utils/logger.js';

const server = http.createServer(app);

// Attach WebSocket server
attachWsServer(server);

// Start batch jobs
startSignalExpiryJob();
startMomentExpiryJob();

// Graceful shutdown
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down...');

  server.close(async () => {
    try {
      await pool.end();
      await redis.quit();
      logger.info('Server shut down gracefully');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

// Start server (0.0.0.0 binding required for Render/Docker)
server.listen(config.PORT, '0.0.0.0', () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    `URIA Backend listening on port ${config.PORT}`,
  );
});

export default server;
