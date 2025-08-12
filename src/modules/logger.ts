/**
 * Logging utilities for OpenAI Deep Research MCP Server
 * Provides structured logging with different output formats and levels
 */

import winston from 'winston';
import type { Logger } from '@/types';

/**
 * Development logging format (human-readable)
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

/**
 * Production logging format (JSON)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create the base Winston logger
 */
function createBaseLogger(): winston.Logger {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const logFormat = process.env.LOG_FORMAT || 'simple';
  const isMCPServer = process.env.MCP_SERVER_MODE === 'true' || process.argv.includes('--mcp-server');

  const logger = winston.createLogger({
    level: logLevel,
    format: logFormat === 'json' ? productionFormat : developmentFormat,
    transports: [],
    exitOnError: false,
  });

  // For MCP servers, only use file logging to avoid interfering with stdio JSON-RPC
  if (isMCPServer) {
    // Ensure logs directory exists
    try {
      const fs = require('fs');
      const path = require('path');
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      logger.add(
        new winston.transports.File({
          filename: 'logs/mcp-server.log',
          handleExceptions: true,
          handleRejections: true,
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );

      logger.add(
        new winston.transports.File({
          filename: 'logs/mcp-error.log',
          level: 'error',
          handleExceptions: true,
          handleRejections: true,
          maxsize: 10485760, // 10MB
          maxFiles: 3,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    } catch (error) {
      // If file logging fails, fall back to silent mode
      // Don't add any transports to avoid stdio interference
    }
  } else {
    // For non-MCP usage (development, testing), use console logging
    logger.add(
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      })
    );
  }

  // Add additional file transports in production
  if (process.env.NODE_ENV === 'production' && !isMCPServer) {
    logger.add(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        handleExceptions: true,
        handleRejections: true,
      })
    );
    
    logger.add(
      new winston.transports.File({
        filename: 'logs/combined.log',
        handleExceptions: true,
        handleRejections: true,
      })
    );
  }

  return logger;
}

/**
 * Global Winston logger instance
 */
const winstonLogger = createBaseLogger();

/**
 * Logger implementation that wraps Winston
 */
export class AppLogger implements Logger {
  private winston: winston.Logger;
  private context: object;

  constructor(winston: winston.Logger, context: object = {}) {
    this.winston = winston;
    this.context = context;
  }

  info(message: string, meta: object = {}): void {
    this.winston.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta: object = {}): void {
    this.winston.warn(message, { ...this.context, ...meta });
  }

  error(message: string, meta: object = {}): void {
    this.winston.error(message, { ...this.context, ...meta });
  }

  debug(message: string, meta: object = {}): void {
    this.winston.debug(message, { ...this.context, ...meta });
  }

  child(meta: object): Logger {
    return new AppLogger(this.winston, { ...this.context, ...meta });
  }
}

/**
 * Create a logger with optional context
 */
export function createLogger(context: object = {}): Logger {
  return new AppLogger(winstonLogger, context);
}

/**
 * Create a logger with component context
 */
export function createContextLogger(context: { component: string; [key: string]: unknown }): Logger {
  return createLogger(context);
}

/**
 * Set global log level
 */
export function setLogLevel(level: string): void {
  winstonLogger.level = level;
}

/**
 * Get current log level
 */
export function getLogLevel(): string {
  return winstonLogger.level;
}

/**
 * Log request information
 */
export function logRequest(
  requestId: string,
  method: string,
  details: object = {}
): void {
  winstonLogger.info('Request processed', {
    request_id: requestId,
    method,
    ...details,
  });
}

/**
 * Log performance metrics
 */
export function logPerformance(
  operation: string,
  duration: number,
  details: object = {}
): void {
  winstonLogger.info('Performance metric', {
    operation,
    duration_ms: duration,
    ...details,
  });
}

/**
 * Log cost information
 */
export function logCost(
  operation: string,
  costUsd: number,
  details: object = {}
): void {
  winstonLogger.info('Cost tracking', {
    operation,
    cost_usd: costUsd,
    ...details,
  });
}

/**
 * Log security events
 */
export function logSecurity(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: object = {}
): void {
  const logMethod = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
  winstonLogger[logMethod]('Security event', {
    security_event: event,
    severity,
    ...details,
  });
}

export default {
  createLogger,
  createContextLogger,
  setLogLevel,
  getLogLevel,
  logRequest,
  logPerformance,
  logCost,
  logSecurity,
};
