/**
 * OpenAI Deep Research API Types
 * Comprehensive type definitions for OpenAI Deep Research integration
 */

import { z } from 'zod';

// ============================================================================
// Request & Response Types
// ============================================================================

/**
 * Deep Research Request Schema
 */
const DoDeepResearchSchema = z.object({
  // Core Research Parameters
  research_query: z.string()
    .min(10, "Research query must be at least 10 characters")
    .max(2000, "Research query must not exceed 2000 characters")
    .describe("The research question or topic to investigate. Be specific and detailed for best results."),
  
  accuracy_level: z.enum(["high", "medium"])
    .describe("Research accuracy level: 'high' uses o3-deep-research (slower, expensive, comprehensive), 'medium' uses o4-mini-deep-research (faster, cheaper, focused)"),
  
  // Optional Performance Controls
  max_tokens: z.number()
    .int()
    .min(500)
    .optional()
    .describe("Maximum number of tokens in the research response"),
  
  temperature: z.number()
    .min(0)
    .max(1)
    .default(0.3)
    .optional()
    .describe("Research creativity level (0.0 = focused, 1.0 = creative)"),
  
  // Research Scope Controls
  time_range: z.object({
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional()
  }).optional().describe("Optional time range for research focus"),
  
  domain_focus: z.array(z.string())
    .max(5)
    .optional()
    .describe("Optional domains to focus research on (e.g., ['academic', 'news', 'technical'])"),
  
  // Response Format Preferences
  include_sources: z.boolean()
    .default(true)
    .describe("Whether to include source URLs and citations"),
  
  response_format: z.enum(["comprehensive", "summary", "bullet_points"])
    .default("comprehensive")
    .describe("Preferred format for research results")
});

export type DoDeepResearchRequest = z.infer<typeof DoDeepResearchSchema>;

/**
 * Token Usage Information
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Cost Information
 */
export interface CostInfo {
  estimated_cost_usd: number;
  cost_per_1k_tokens: number;
  billing_tier: 'premium' | 'standard';
}

/**
 * Deep Research Response
 */
export interface DoDeepResearchResponse {
  // Core Research Results
  research_results: string;           // Main research findings
  executive_summary: string;          // Brief overview of key findings
  
  // Execution Metadata
  model_used: "o3-deep-research" | "o4-mini-deep-research";
  accuracy_level: "high" | "medium";
  execution_time_seconds: number;
  
  // Source Information
  sources_found: number;
  source_urls?: string[];             // If include_sources = true
  source_quality_score: number;       // 0-100, average source credibility
  
  // Token Usage & Cost
  token_usage: TokenUsage;
  cost_info: CostInfo;
  
  // Quality Metrics
  research_confidence: number;        // 0-100, AI's confidence in findings
  coverage_completeness: number;      // 0-100, how comprehensive the research is
  recency_score: number;             // 0-100, how current the information is
  
  // Additional Context
  related_topics: string[];          // Suggested follow-up research topics
  limitations: string[];             // Known limitations or gaps in research
  
  // Raw OpenAI Data
  raw_openai_output?: any[];         // Raw output array from OpenAI Responses API (includes citations, web search results, intermediate steps)
  
  // Request Tracking
  request_id: string;
  timestamp: string;
  rate_limit_remaining: number;
}

// ============================================================================
// Model Configuration Types
// ============================================================================

/**
 * OpenAI Model Configuration
 */
export interface ModelConfiguration {
  model_name: string;
  max_tokens_limit: number;
  cost_per_1k_tokens: number;
  typical_response_time_seconds: number;
  use_cases: string[];
}

/**
 * Model configurations for different accuracy levels
 */
const MODEL_CONFIGS: Record<string, ModelConfiguration> = {
  high: {
    model_name: "o3-deep-research",
    max_tokens_limit: 8000,
    cost_per_1k_tokens: 0.25, // Estimated
    typical_response_time_seconds: 240, // 4 minutes
    use_cases: [
      "Critical business decisions",
      "Academic research",
      "Comprehensive market analysis",
      "Technical deep-dives",
      "Regulatory compliance research"
    ]
  },
  medium: {
    model_name: "o4-mini-deep-research", 
    max_tokens_limit: 4000,
    cost_per_1k_tokens: 0.08, // Estimated
    typical_response_time_seconds: 90, // 1.5 minutes
    use_cases: [
      "General topic research",
      "Quick market overviews",
      "Trend analysis",
      "Competitor monitoring",
      "News summaries"
    ]
  }
};

// ============================================================================
// Error Types
// ============================================================================

/**
 * Research Error Types
 */
export type ResearchErrorType = 
  | "validation" 
  | "authentication" 
  | "rate_limit" 
  | "api_error" 
  | "timeout"
  | "cost_limit";

/**
 * Research Error Response
 */
export interface ResearchError {
  type: ResearchErrorType;
  message: string;
  details?: any;
  suggestion: string;
  retryAfter?: number;
  costSavingsTip?: string;
}

/**
 * Rate Limit Check Result
 */
export interface RateLimitResult {
  allowed: boolean;
  reason?: 'hourly_limit' | 'daily_limit' | 'cost_limit';
  retryAfter?: number;
  remaining?: number;
  dailyRemaining?: number;
  costRemaining?: number;
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Research Metrics for Analytics
 */
export interface ResearchMetrics {
  request_id: string;
  timestamp: string;
  model_used: string;
  accuracy_level: "high" | "medium";
  token_usage: TokenUsage;
  cost_info: CostInfo;
  execution_time_seconds: number;
  research_confidence: number;
  sources_found: number;
  query_length: number;
  response_length: number;
}

/**
 * Analytics Report
 */
export interface AnalyticsReport {
  period: string;
  total_requests: number;
  total_cost: number;
  average_confidence: number;
  model_usage: Record<string, number>;
  peak_hours: number[];
  cost_by_day: Record<string, number>;
  error_rate: number;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

/**
 * OpenAI Client Configuration
 */
export interface OpenAIClientConfig {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  timeout: number;
  maxRetries: number;
  baseURL?: string;
}

/**
 * Rate Limiter Configuration
 */
export interface RateLimitConfig {
  requests_per_hour: number;
  requests_per_day: number;
  tokens_per_day: number;
  daily_cost_limit_usd: number;
  high_accuracy_daily_limit: number;
  medium_accuracy_daily_limit: number;
}

/**
 * Server Configuration
 */
export interface ServerConfig {
  openai: OpenAIClientConfig;
  rateLimits: RateLimitConfig;
  redis: {
    url: string;
    password?: string;
    db?: number;
  };
  server: {
    name: string;
    version: string;
    logLevel: string;
  };
  defaults: {
    accuracy_level: "high" | "medium";
    max_tokens: number;
    temperature: number;
    include_sources: boolean;
    response_format: "comprehensive" | "summary" | "bullet_points";
  };
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation Error Structure
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validation Result
 */
export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Cost Estimate
 */
export interface CostEstimate {
  estimated_total_tokens: number;
  estimated_cost_usd: number;
  estimated_time_seconds: number;
  warning?: string;
}

// ============================================================================
// Export all types
// ============================================================================

export {
  DoDeepResearchSchema,
  MODEL_CONFIGS
};
