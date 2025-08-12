/**
 * Configuration management for OpenAI Deep Research MCP Server
 * Loads and validates environment variables and settings
 */

import dotenv from 'dotenv';
import type { 
  ServerConfig, 
  OpenAIClientConfig, 
  RateLimitConfig 
} from '@/types';

// Load environment variables
dotenv.config();

/**
 * Default server configuration for OpenAI Deep Research
 */
function createDefaultConfig(): ServerConfig {
  const openaiConfig: OpenAIClientConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    timeout: parseInt(process.env.REQUEST_TIMEOUT_SECONDS || '600') * 1000,
    maxRetries: parseInt(process.env.RETRY_ATTEMPTS || '3')
  };

  if (process.env.OPENAI_ORG_ID) {
    openaiConfig.organizationId = process.env.OPENAI_ORG_ID;
  }

  if (process.env.OPENAI_PROJECT_ID) {
    openaiConfig.projectId = process.env.OPENAI_PROJECT_ID;
  }

  if (process.env.OPENAI_BASE_URL) {
    openaiConfig.baseURL = process.env.OPENAI_BASE_URL;
  }

  const redisConfig = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    db: parseInt(process.env.REDIS_DB || '0')
  } as { url: string; password?: string; db?: number };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  return {
    openai: openaiConfig,
    rateLimits: {
      requests_per_hour: parseInt(process.env.MAX_REQUESTS_PER_HOUR || '10'),
      requests_per_day: parseInt(process.env.MAX_REQUESTS_PER_DAY || '30'),
      tokens_per_day: parseInt(process.env.MAX_TOKENS_PER_DAY || '100000'),
      daily_cost_limit_usd: parseFloat(process.env.MAX_DAILY_COST_USD || '25.00'),
      high_accuracy_daily_limit: parseInt(process.env.HIGH_ACCURACY_DAILY_LIMIT || '8'),
      medium_accuracy_daily_limit: parseInt(process.env.MEDIUM_ACCURACY_DAILY_LIMIT || '15')
    },
    redis: redisConfig,
    server: {
      name: process.env.SERVER_NAME || 'openai-deep-research-mcp-server',
      version: process.env.SERVER_VERSION || '1.0.0',
      logLevel: process.env.LOG_LEVEL || 'info'
    },
    defaults: {
      accuracy_level: (process.env.DEFAULT_ACCURACY_LEVEL as "high" | "medium") || 'medium',
      max_tokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      include_sources: process.env.DEFAULT_INCLUDE_SOURCES !== 'false',
      response_format: (process.env.DEFAULT_RESPONSE_FORMAT as "comprehensive" | "summary" | "bullet_points") || 'comprehensive'
    }
  };
}

/**
 * Get the current configuration
 */
export function getConfig(): ServerConfig {
  return createDefaultConfig();
}

/**
 * Validate configuration settings
 */
export function validateConfig(config: ServerConfig): string[] {
  const errors: string[] = [];

  // Validate OpenAI configuration
  if (!config.openai.apiKey) {
    errors.push('OpenAI API key is required (OPENAI_API_KEY)');
  }

  if (config.openai.timeout < 10000) {
    errors.push('OpenAI timeout must be at least 10 seconds');
  }

  if (config.openai.maxRetries < 1 || config.openai.maxRetries > 10) {
    errors.push('OpenAI max retries must be between 1 and 10');
  }

  // Validate Redis configuration
  if (!config.redis.url) {
    errors.push('Redis URL is required (REDIS_URL)');
  }

  // Validate rate limits
  if (config.rateLimits.requests_per_hour < 1 || config.rateLimits.requests_per_hour > 1000) {
    errors.push('Requests per hour must be between 1 and 1000');
  }

  if (config.rateLimits.requests_per_day < 1 || config.rateLimits.requests_per_day > 10000) {
    errors.push('Requests per day must be between 1 and 10000');
  }

  if (config.rateLimits.daily_cost_limit_usd < 0.01 || config.rateLimits.daily_cost_limit_usd > 1000) {
    errors.push('Daily cost limit must be between $0.01 and $1000');
  }

  if (config.rateLimits.high_accuracy_daily_limit > config.rateLimits.requests_per_day) {
    errors.push('High accuracy daily limit cannot exceed total daily requests');
  }

  if (config.rateLimits.medium_accuracy_daily_limit > config.rateLimits.requests_per_day) {
    errors.push('Medium accuracy daily limit cannot exceed total daily requests');
  }

  // Validate server configuration
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.server.logLevel)) {
    errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate defaults
  if (!['high', 'medium'].includes(config.defaults.accuracy_level)) {
    errors.push('Default accuracy level must be "high" or "medium"');
  }

  if (config.defaults.max_tokens < 500 || config.defaults.max_tokens > 8000) {
    errors.push('Default max tokens must be between 500 and 8000');
  }

  if (config.defaults.temperature < 0 || config.defaults.temperature > 1) {
    errors.push('Default temperature must be between 0 and 1');
  }

  if (!['comprehensive', 'summary', 'bullet_points'].includes(config.defaults.response_format)) {
    errors.push('Default response format must be "comprehensive", "summary", or "bullet_points"');
  }

  return errors;
}

/**
 * Load and validate configuration, throw error if invalid
 */
export function loadConfig(): ServerConfig {
  const config = getConfig();
  const errors = validateConfig(config);
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return config;
}

/**
 * Extract OpenAI client configuration
 */
export function getOpenAIConfig(config: ServerConfig): OpenAIClientConfig {
  const openaiConfig: OpenAIClientConfig = {
    apiKey: config.openai.apiKey,
    timeout: config.openai.timeout,
    maxRetries: config.openai.maxRetries
  };

  if (config.openai.organizationId) {
    openaiConfig.organizationId = config.openai.organizationId;
  }

  if (config.openai.projectId) {
    openaiConfig.projectId = config.openai.projectId;
  }

  if (config.openai.baseURL) {
    openaiConfig.baseURL = config.openai.baseURL;
  }

  return openaiConfig;
}

/**
 * Extract rate limit configuration
 */
export function getRateLimitConfig(config: ServerConfig): RateLimitConfig {
  return { ...config.rateLimits };
}

/**
 * Check if running in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production mode
 */
export function isProductionMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

export default {
  getConfig,
  validateConfig,
  loadConfig,
  getOpenAIConfig,
  getRateLimitConfig,
  isDevelopmentMode,
  isProductionMode
};
