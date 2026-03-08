import { createApp } from './app';
import { createLogger } from './logger';
import { getGuardianPort } from './config';

const logger = createLogger('Server');

async function start() {
  try {
    const { httpServer, pool } = await createApp();
    const port = getGuardianPort();

    // Start listening
    httpServer.listen(port, () => {
      logger.info(`Guardian server listening on port ${port}`);
    });

    // HTTP server error handling
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
      } else {
        logger.error('Server error', error);
      }
      process.exit(1);
    });

    // Graceful shutdown handler: closes HTTP server and worker pool
    const gracefulShutdown = async () => {
      logger.info('Shutdown signal received, shutting down gracefully...');
      httpServer.close(async () => {
        logger.info('Server closed');
        await pool.shutdown();
        logger.info('Worker pool shut down');
        process.exit(0);
      });
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after 30s timeout');
        process.exit(1);
      }, 30000);
    };

    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', gracefulShutdown);

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', gracefulShutdown);

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start();
