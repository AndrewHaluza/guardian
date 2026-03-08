/**
 * Structured logger for Code Guardian powered by Winston
 * Outputs JSON logs for easy parsing by log aggregation services (ELK, Splunk, etc.)
 */

import winston from 'winston';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Determine if we should output human-readable logs (development) or JSON (production)
 */
const isProduction = process.env.NODE_ENV === 'production';
const useJsonFormat = process.env.LOG_FORMAT === 'json' || isProduction;

/**
 * Shared Winston logger instance with structured JSON output
 */
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    // Structured JSON format for all environments
    winston.format.json()
  ),
  defaultMeta: {
    service: 'guardian',
  },
  transports: [
    // Console transport - outputs JSON or human-readable based on environment
    new winston.transports.Console({
      format: useJsonFormat
        ? winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        : // Human-readable format for development
          winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            winston.format.colorize({ all: true }),
            winston.format.printf(({ timestamp, level, message, context, data, ...rest }) => {
              let output = `[${timestamp}] [${level.toUpperCase()}]`;
              if (context) {
                output += ` [${context}]`;
              }
              output += ` ${message}`;

              // Include data if present
              if (data !== undefined && data !== null) {
                if (data instanceof Error) {
                  output += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
                } else if (typeof data === 'object') {
                  output += `\n${JSON.stringify(data, null, 2)}`;
                } else {
                  output += ` ${data}`;
                }
              }

              // Include any additional metadata
              const metaKeys = Object.keys(rest).filter((k) => k !== 'service');
              if (metaKeys.length > 0) {
                output += `\n  Metadata: ${JSON.stringify(rest)}`;
              }

              return output;
            })
          ),
    }),
  ],
});

class Logger {
  private winstonInstance: winston.Logger;

  constructor(context: string) {
    this.winstonInstance = winstonLogger.child({ context });
  }

  debug(message: string, data?: unknown): void {
    this.winstonInstance.debug(message, { data });
  }

  info(message: string, data?: unknown): void {
    this.winstonInstance.info(message, { data });
  }

  warn(message: string, data?: unknown): void {
    this.winstonInstance.warn(message, { data });
  }

  error(message: string, data?: unknown): void {
    this.winstonInstance.error(message, { data });
  }
}

/**
 * Create a logger instance for a specific module/component
 * @param context Module name or component name
 * @returns Logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * Get the underlying Winston logger (for advanced use cases)
 */
export function getWinstonLogger(): winston.Logger {
  return winstonLogger;
}
