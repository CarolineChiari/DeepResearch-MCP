/**
 * Rate Limiter for OpenAI Deep Research MCP Server
 * Implements in-memory rate limiting with cost controls
 */

import dotenv from 'dotenv';
import type { RateLimitResult, RateLimitConfig, Logger } from '@/types';

// Load environment variables
dotenv.config();

interface ClientUsage {
  requestCounts: Map<string, number>; // timeWindow -> count
  totalCost: number;
  lastRequestTime: number;
}

export class ResearchRateLimiter {
  private logger: Logger;
  private config: RateLimitConfig;
  private clientUsage: Map<string, ClientUsage> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    // Setup periodic cleanup of old entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, 60000); // Cleanup every minute
    
    this.logger.info('Rate limiter initialized with in-memory storage', {
      maxRequestsPerHour: config.requests_per_hour,
      maxDailyCost: config.daily_cost_limit_usd
    });
  }

  /**
   * Check if a client can make a request based on rate limits
   */
  async checkRateLimit(
    clientId: string,
    accuracyLevel: "high" | "medium",
    estimatedCost?: number
  ): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const currentHour = Math.floor(now / (60 * 60 * 1000));
      const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));

      // Get or create client usage
      let usage = this.clientUsage.get(clientId);
      if (!usage) {
        usage = {
          requestCounts: new Map(),
          totalCost: 0,
          lastRequestTime: now
        };
        this.clientUsage.set(clientId, usage);
      }

      // Check hourly rate limits
      const hourKey = `hour:${currentHour}`;
      const hourlyRequests = usage.requestCounts.get(hourKey) || 0;
      
      const hourlyLimit = this.getHourlyLimit(accuracyLevel);
      if (hourlyRequests >= hourlyLimit) {
        this.logger.warn('Hourly rate limit exceeded', {
          clientId,
          accuracyLevel,
          currentRequests: hourlyRequests,
          limit: hourlyLimit
        });

        return {
          allowed: false,
          reason: 'hourly_limit',
          remaining: 0,
          retryAfter: (currentHour + 1) * 60 * 60 * 1000,
          costRemaining: this.config.daily_cost_limit_usd - usage.totalCost
        };
      }

      // Check daily cost limits
      const dailyCost = this.getDailyCost(usage, currentDay);
      
      if (estimatedCost && (dailyCost + estimatedCost) > this.config.daily_cost_limit_usd) {
        this.logger.warn('Daily cost limit would be exceeded', {
          clientId,
          currentCost: dailyCost,
          estimatedCost,
          limit: this.config.daily_cost_limit_usd
        });

        return {
          allowed: false,
          reason: 'cost_limit',
          remaining: hourlyLimit - hourlyRequests,
          retryAfter: (currentDay + 1) * 24 * 60 * 60 * 1000,
          costRemaining: Math.max(0, this.config.daily_cost_limit_usd - dailyCost)
        };
      }

      // Check daily request limits for accuracy level
      const dailyRequests = this.getDailyRequests(usage, currentDay, accuracyLevel);
      const dailyLimit = this.getDailyLimit(accuracyLevel);
      
      if (dailyRequests >= dailyLimit) {
        this.logger.warn('Daily request limit exceeded', {
          clientId,
          accuracyLevel,
          currentRequests: dailyRequests,
          limit: dailyLimit
        });

        return {
          allowed: false,
          reason: 'daily_limit',
          remaining: 0,
          retryAfter: (currentDay + 1) * 24 * 60 * 60 * 1000,
          costRemaining: Math.max(0, this.config.daily_cost_limit_usd - dailyCost)
        };
      }

      // Allow the request
      return {
        allowed: true,
        remaining: Math.min(
          hourlyLimit - hourlyRequests - 1,
          dailyLimit - dailyRequests - 1
        ),
        retryAfter: (currentHour + 1) * 60 * 60 * 1000,
        costRemaining: Math.max(0, this.config.daily_cost_limit_usd - dailyCost)
      };

    } catch (error) {
      this.logger.error('Rate limit check failed', { error, clientId });
      // In case of error, allow the request but log it
      return {
        allowed: true,
        remaining: 0,
        retryAfter: Date.now() + 60 * 60 * 1000, // 1 hour from now
        costRemaining: this.config.daily_cost_limit_usd
      };
    }
  }

  /**
   * Record a completed request for rate limiting
   */
  async recordRequest(
    clientId: string,
    accuracyLevel: "high" | "medium",
    actualCost: number,
    tokensUsed: number
  ): Promise<void> {
    try {
      const now = Date.now();
      const currentHour = Math.floor(now / (60 * 60 * 1000));
      const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));

      // Get or create client usage
      let usage = this.clientUsage.get(clientId);
      if (!usage) {
        usage = {
          requestCounts: new Map(),
          totalCost: 0,
          lastRequestTime: now
        };
        this.clientUsage.set(clientId, usage);
      }

      // Record hourly request
      const hourKey = `hour:${currentHour}`;
      const hourlyRequests = usage.requestCounts.get(hourKey) || 0;
      usage.requestCounts.set(hourKey, hourlyRequests + 1);

      // Record daily request for accuracy level
      const dailyKey = `day:${currentDay}:${accuracyLevel}`;
      const dailyRequests = usage.requestCounts.get(dailyKey) || 0;
      usage.requestCounts.set(dailyKey, dailyRequests + 1);

      // Record cost
      const costKey = `cost:${currentDay}`;
      const dailyCost = usage.requestCounts.get(costKey) || 0;
      usage.requestCounts.set(costKey, dailyCost + actualCost);

      // Update usage
      usage.totalCost += actualCost;
      usage.lastRequestTime = now;

      this.logger.debug('Request recorded for rate limiting', {
        clientId,
        accuracyLevel,
        actualCost,
        tokensUsed,
        hourlyRequests: hourlyRequests + 1,
        dailyRequests: dailyRequests + 1
      });

    } catch (error) {
      this.logger.error('Failed to record request for rate limiting', {
        error,
        clientId,
        accuracyLevel
      });
    }
  }

  /**
   * Get current usage statistics for a client
   */
  async getUsageStats(clientId: string): Promise<{
    hourlyRequests: number;
    dailyCost: number;
    highAccuracyRequests: number;
    mediumAccuracyRequests: number;
  }> {
    const usage = this.clientUsage.get(clientId);
    if (!usage) {
      return {
        hourlyRequests: 0,
        dailyCost: 0,
        highAccuracyRequests: 0,
        mediumAccuracyRequests: 0
      };
    }

    const now = Date.now();
    const currentHour = Math.floor(now / (60 * 60 * 1000));
    const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));

    const hourKey = `hour:${currentHour}`;
    const costKey = `cost:${currentDay}`;
    const highKey = `day:${currentDay}:high`;
    const mediumKey = `day:${currentDay}:medium`;

    return {
      hourlyRequests: usage.requestCounts.get(hourKey) || 0,
      dailyCost: usage.requestCounts.get(costKey) || 0,
      highAccuracyRequests: usage.requestCounts.get(highKey) || 0,
      mediumAccuracyRequests: usage.requestCounts.get(mediumKey) || 0
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const cutoffTime = now - (48 * 60 * 60 * 1000); // Keep 48 hours of data

    for (const [clientId, usage] of this.clientUsage.entries()) {
      if (usage.lastRequestTime < cutoffTime) {
        // Remove very old client data
        this.clientUsage.delete(clientId);
        continue;
      }

      // Clean up old time windows within each client's data
      const currentHour = Math.floor(now / (60 * 60 * 1000));
      const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));
      
      for (const [key] of usage.requestCounts.entries()) {
        if (key.startsWith('hour:')) {
          const hourStr = key.split(':')[1];
          if (hourStr) {
            const hour = parseInt(hourStr);
            if (hour < currentHour - 1) { // Keep only current and previous hour
              usage.requestCounts.delete(key);
            }
          }
        } else if (key.startsWith('day:') || key.startsWith('cost:')) {
          const dayStr = key.split(':')[1];
          if (dayStr) {
            const day = parseInt(dayStr);
            if (day < currentDay - 1) { // Keep only current and previous day
              usage.requestCounts.delete(key);
            }
          }
        }
      }
    }

    this.logger.debug('Cleaned up old rate limiting entries', {
      activeClients: this.clientUsage.size
    });
  }

  /**
   * Get hourly limit based on accuracy level
   */
  private getHourlyLimit(accuracyLevel: "high" | "medium"): number {
    return accuracyLevel === 'high' 
      ? this.config.high_accuracy_daily_limit || 3
      : this.config.medium_accuracy_daily_limit || 6;
  }

  /**
   * Get daily limit based on accuracy level
   */
  private getDailyLimit(accuracyLevel: "high" | "medium"): number {
    return accuracyLevel === 'high'
      ? this.config.high_accuracy_daily_limit || 8
      : this.config.medium_accuracy_daily_limit || 15;
  }

  /**
   * Get daily cost for a client
   */
  private getDailyCost(usage: ClientUsage, currentDay: number): number {
    const costKey = `cost:${currentDay}`;
    return usage.requestCounts.get(costKey) || 0;
  }

  /**
   * Get daily requests for a specific accuracy level
   */
  private getDailyRequests(usage: ClientUsage, currentDay: number, accuracyLevel: "high" | "medium"): number {
    const dailyKey = `day:${currentDay}:${accuracyLevel}`;
    return usage.requestCounts.get(dailyKey) || 0;
  }

  /**
   * Clean up resources when shutting down
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clientUsage.clear();
    this.logger.info('Rate limiter cleaned up');
  }
}

/**
 * Create a default rate limit configuration
 */
export function createDefaultRateLimitConfig(): RateLimitConfig {
  return {
    requests_per_hour: parseInt(process.env.MAX_REQUESTS_PER_HOUR || '10'),
    requests_per_day: parseInt(process.env.MAX_REQUESTS_PER_DAY || '50'),
    tokens_per_day: parseInt(process.env.MAX_TOKENS_PER_DAY || '100000'),
    daily_cost_limit_usd: parseFloat(process.env.MAX_DAILY_COST_USD || '25.00'),
    high_accuracy_daily_limit: parseInt(process.env.HIGH_ACCURACY_DAILY_LIMIT || '8'),
    medium_accuracy_daily_limit: parseInt(process.env.MEDIUM_ACCURACY_DAILY_LIMIT || '15')
  };
}
