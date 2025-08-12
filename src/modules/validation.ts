/**
 * Request validation for OpenAI Deep Research MCP Server
 * Validates research requests, parameters, and input sanitization
 */

import { z } from 'zod';
import type { 
  DoDeepResearchRequest, 
  ValidationError, 
  ValidationResult,
  Logger 
} from '@/types';

/**
 * Zod schema for research query validation
 */
export const ResearchQuerySchema = z.string()
  .min(10, "Research query must be at least 10 characters")
  .max(2000, "Research query must not exceed 2000 characters")
  .regex(/^[^<>]*$/, "Research query cannot contain HTML/XML tags")
  .refine(
    (query) => query.trim().length >= 10,
    "Research query must contain meaningful content"
  );

/**
 * Zod schema for accuracy level validation
 */
export const AccuracyLevelSchema = z.enum(["high", "medium"], {
  errorMap: () => ({ 
    message: "Accuracy level must be either 'high' or 'medium'" 
  })
});

/**
 * Zod schema for response format validation
 */
export const ResponseFormatSchema = z.enum([
  "comprehensive", 
  "summary", 
  "bullet_points"
], {
  errorMap: () => ({ 
    message: "Response format must be 'comprehensive', 'summary', or 'bullet_points'" 
  })
}).default("comprehensive");

/**
 * Zod schema for max tokens validation
 */
export const MaxTokensSchema = z.number()
  .int("Max tokens must be an integer")
  .min(500, "Max tokens must be at least 500")
  .max(8000, "Max tokens cannot exceed 8000")
  .default(4000);

/**
 * Zod schema for temperature validation
 */
export const TemperatureSchema = z.number()
  .min(0, "Temperature must be at least 0")
  .max(1, "Temperature cannot exceed 1")
  .default(0.3);

/**
 * Complete schema for do_deep_research request validation
 */
export const DoDeepResearchSchema = z.object({
  research_query: ResearchQuerySchema,
  accuracy_level: AccuracyLevelSchema,
  max_tokens: MaxTokensSchema.optional(),
  temperature: TemperatureSchema.optional(),
  include_sources: z.boolean().default(true),
  response_format: ResponseFormatSchema
});

/**
 * Validation class for research requests
 */
export class ResearchRequestValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate a complete research request
   */
  validateResearchRequest(data: unknown): ValidationResult<DoDeepResearchRequest> {
    try {
      // Parse and validate with Zod schema
      const validatedData = DoDeepResearchSchema.parse(data);
      
      // Additional business logic validation
      const businessValidation = this.validateBusinessRules(validatedData);
      if (!businessValidation.isValid) {
        return businessValidation;
      }

      // Content safety validation
      const safetyValidation = this.validateContentSafety(validatedData.research_query);
      if (!safetyValidation.isValid) {
        return {
          isValid: false,
          errors: safetyValidation.errors || []
        };
      }

      this.logger.debug('Research request validation passed', {
        query_length: validatedData.research_query.length,
        accuracy_level: validatedData.accuracy_level,
        max_tokens: validatedData.max_tokens
      });

      return {
        isValid: true,
        data: validatedData
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors: ValidationError[] = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        this.logger.warn('Research request validation failed', {
          errors: validationErrors
        });

        return {
          isValid: false,
          errors: validationErrors
        };
      }

      this.logger.error('Unexpected validation error', { error });
      return {
        isValid: false,
        errors: [{
          field: 'unknown',
          message: 'An unexpected validation error occurred',
          code: 'unknown'
        }]
      };
    }
  }

  /**
   * Validate business rules for research requests
   */
  private validateBusinessRules(request: DoDeepResearchRequest): ValidationResult<DoDeepResearchRequest> {
    const errors: ValidationError[] = [];

    // Check for reasonable token limits based on accuracy level
    if (request.accuracy_level === 'high' && request.max_tokens && request.max_tokens < 2000) {
      errors.push({
        field: 'max_tokens',
        message: 'High accuracy research typically requires at least 2000 tokens for quality results',
        code: 'business_rule'
      });
    }

    // Check for reasonable temperature settings
    if (request.temperature !== undefined) {
      if (request.accuracy_level === 'high' && request.temperature > 0.5) {
        errors.push({
          field: 'temperature',
          message: 'High accuracy research works best with lower temperature (≤ 0.5)',
          code: 'business_rule'
        });
      }
    }

    // Validate query complexity for accuracy level
    const queryComplexity = this.assessQueryComplexity(request.research_query);
    if (request.accuracy_level === 'medium' && queryComplexity === 'high') {
      // This is a warning, not an error
      this.logger.warn('Complex query with medium accuracy level', {
        query: request.research_query.substring(0, 100),
        complexity: queryComplexity
      });
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors
      };
    }

    return {
      isValid: true,
      data: request
    };
  }

  /**
   * Validate content safety and detect potential issues
   */
  private validateContentSafety(query: string): ValidationResult<string> {
    const errors: ValidationError[] = [];

    // Check for potential injection attempts
    const dangerousPatterns = [
      /javascript:/i,
      /<script/i,
      /eval\(/i,
      /function\s*\(/i,
      /on\w+\s*=/i,
      /data:text\/html/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        errors.push({
          field: 'research_query',
          message: 'Research query contains potentially unsafe content',
          code: 'security'
        });
        break;
      }
    }

    // Check for excessive special characters
    const specialCharCount = (query.match(/[^a-zA-Z0-9\s.,!?;:()\-'"]/g) || []).length;
    if (specialCharCount > query.length * 0.2) {
      errors.push({
        field: 'research_query',
        message: 'Research query contains too many special characters',
        code: 'format'
      });
    }

    // Check for potential spam indicators
    const repeatedPatterns = query.match(/(.{3,})\1{3,}/g);
    if (repeatedPatterns && repeatedPatterns.length > 0) {
      errors.push({
        field: 'research_query',
        message: 'Research query contains excessive repetition',
        code: 'spam'
      });
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors
      };
    }

    return {
      isValid: true,
      data: query
    };
  }

  /**
   * Assess the complexity of a research query
   */
  private assessQueryComplexity(query: string): 'low' | 'medium' | 'high' {
    let complexityScore = 0;

    // Length factor
    if (query.length > 200) complexityScore += 2;
    else if (query.length > 100) complexityScore += 1;

    // Question complexity
    const questionCount = (query.match(/\?/g) || []).length;
    if (questionCount > 3) complexityScore += 2;
    else if (questionCount > 1) complexityScore += 1;

    // Technical terms
    const technicalTerms = [
      'analysis', 'comparison', 'evaluation', 'methodology', 'framework',
      'implementation', 'architecture', 'algorithm', 'optimization',
      'research', 'study', 'investigation', 'assessment', 'review'
    ];
    
    const technicalTermCount = technicalTerms.filter(term => 
      query.toLowerCase().includes(term)
    ).length;
    
    if (technicalTermCount > 3) complexityScore += 2;
    else if (technicalTermCount > 1) complexityScore += 1;

    // Multiple topics
    const topicIndicators = ['and', 'or', 'versus', 'vs', 'compared to', 'as well as'];
    const topicCount = topicIndicators.filter(indicator => 
      query.toLowerCase().includes(indicator)
    ).length;
    
    if (topicCount > 2) complexityScore += 2;
    else if (topicCount > 0) complexityScore += 1;

    // Determine complexity level
    if (complexityScore >= 5) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Sanitize research query for safe processing
   */
  sanitizeQuery(query: string): string {
    // Remove potentially dangerous characters while preserving meaning
    let sanitized = query
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:text\/html/gi, '') // Remove data URLs
      .trim();

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');

    // Limit length as additional safety measure
    if (sanitized.length > 2000) {
      sanitized = sanitized.substring(0, 2000);
      this.logger.warn('Research query truncated for safety', {
        original_length: query.length,
        truncated_length: sanitized.length
      });
    }

    return sanitized;
  }

  /**
   * Validate client ID format
   */
  validateClientId(clientId: string): ValidationResult<string> {
    if (!clientId || typeof clientId !== 'string') {
      return {
        isValid: false,
        errors: [{
          field: 'clientId',
          message: 'Client ID is required and must be a string',
          code: 'required'
        }]
      };
    }

    // Basic format validation
    if (clientId.length < 3 || clientId.length > 100) {
      return {
        isValid: false,
        errors: [{
          field: 'clientId',
          message: 'Client ID must be between 3 and 100 characters',
          code: 'length'
        }]
      };
    }

    // Character validation
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(clientId)) {
      return {
        isValid: false,
        errors: [{
          field: 'clientId',
          message: 'Client ID can only contain alphanumeric characters, underscores, hyphens, and periods',
          code: 'format'
        }]
      };
    }

    return {
      isValid: true,
      data: clientId
    };
  }
}

/**
 * Create a default validator instance
 */
export function createValidator(logger: Logger): ResearchRequestValidator {
  return new ResearchRequestValidator(logger);
}
