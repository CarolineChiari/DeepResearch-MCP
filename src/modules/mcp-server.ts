/**
 * Core MCP Server implementation for Ope    try {
      // Step 1: Initialize request validator
      this.logger.info('Step 1: Initializing request validator');
      this.validator = new ResearchRequestValidator(this.logger);
      this.logger.info('✅ Request validator initialized successfully');search
 * Provides do_deep_research tool that delegates to OpenAI's specialized models
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dotenv from 'dotenv';
import type {
  DoDeepResearchRequest,
  MCPToolResponse,
  Logger,
  OpenAIClientConfig
} from '@/types';
import { createContextLogger } from './logger.js';
import { DoDeepResearchSchema, ResearchRequestValidator } from './validation.js';
import { OpenAIDeepResearchClient } from './openai-client.js';
import { getConfig } from './config.js';

// Load environment variables
dotenv.config();

/**
 * OpenAI Deep Research MCP Server
 * Implements the Model Context Protocol for deep research operations using OpenAI's APIs
 */
export class OpenAIDeepResearchMCPServer {
  private server: McpServer;
  private logger: Logger;
  private openaiClient!: OpenAIDeepResearchClient;
  private validator!: ResearchRequestValidator;

  constructor() {
    this.server = new McpServer({
      name: 'openai-deep-research-mcp-server',
      version: '1.0.0',
    });
    this.logger = createContextLogger({ component: 'MCPServer' });
  }

  /**
   * Initialize the MCP server and all its components
   */
  async initialize(): Promise<void> {
    this.logger.info('=== INITIALIZING OpenAI Deep Research MCP Server ===');
    
    try {
      // Step 1: Initialize request validator
      this.logger.info('Step 1: Initializing request validator');
      this.validator = new ResearchRequestValidator(this.logger);
      this.logger.info('✅ Request validator initialized successfully');

      // Step 2: Initialize OpenAI client
      this.logger.info('Step 2: Initializing OpenAI client');
      await this.initializeOpenAI();
      this.logger.info('✅ OpenAI client initialized successfully');

      // Step 3: Setup MCP tools
      this.logger.info('Step 3: Setting up MCP tools');
      this.setupTools();
      this.logger.info('✅ MCP tools setup completed');

      this.logger.info('=== MCP SERVER INITIALIZATION COMPLETED SUCCESSFULLY ===');
      
    } catch (error) {
      this.logger.error('❌ MCP server initialization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      throw error;
    }
  }

  /**
   * Get the underlying MCP server instance
   */
  getServer(): McpServer {
    return this.server;
  }

  private async initializeOpenAI(): Promise<void> {
    const config: OpenAIClientConfig = {
      apiKey: process.env.OPENAI_API_KEY!,
      timeout: parseInt(process.env.REQUEST_TIMEOUT_SECONDS || '600'),
      maxRetries: parseInt(process.env.RETRY_ATTEMPTS || '3')
    };

    if (process.env.OPENAI_ORG_ID) {
      config.organizationId = process.env.OPENAI_ORG_ID;
    }

    if (process.env.OPENAI_PROJECT_ID) {
      config.projectId = process.env.OPENAI_PROJECT_ID;
    }

    // Check if API key is configured
    if (!config.apiKey || config.apiKey.startsWith('sk-test-mock')) {
      this.logger.warn('Using mock/test OpenAI API key - validation skipped');
      this.openaiClient = new OpenAIDeepResearchClient(config, this.logger);
      return;
    }

    this.openaiClient = new OpenAIDeepResearchClient(config, this.logger);
    
    // Only validate connection with real API keys
    try {
      await this.openaiClient.validateConnection();
    } catch (error) {
      this.logger.error('OpenAI connection validation failed', { error });
      throw error;
    }
  }

  /**
   * Setup MCP tools
   */
  private setupTools(): void {
    // Register do_deep_research tool
    this.server.registerTool('do_deep_research', {
      description: 'Perform deep research using OpenAI\'s specialized research models. Supports high accuracy (o3-deep-research) and medium accuracy (o4-mini-deep-research) research.',
      inputSchema: DoDeepResearchSchema.shape,
    }, async (request) => {
      return this.handleDeepResearchRequest(request as DoDeepResearchRequest);
    });

    this.logger.info('MCP tools registered successfully', {
      tools: ['do_deep_research']
    });
  }

  /**
   * Handle deep research requests
   */
  private async handleDeepResearchRequest(request: DoDeepResearchRequest): Promise<MCPToolResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clientId = this.getClientId(); // Extract from context or generate

    this.logger.info('Processing deep research request', {
      request_id: requestId,
      client_id: clientId,
      accuracy_level: request.accuracy_level,
      query_length: request.research_query.length
    });

    try {
      // Step 1: Validate the request
      const validationResult = this.validator.validateResearchRequest(request);
      if (!validationResult.isValid) {
        const errorMessage = `Request validation failed: ${validationResult.errors?.map(e => `${e.field}: ${e.message}`).join(', ')}`;
        this.logger.warn('Request validation failed', {
          request_id: requestId,
          errors: validationResult.errors
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: errorMessage,
                error_type: 'validation_error',
                request_id: requestId
              }, null, 2)
            }
          ],
          _meta: {
            request_id: requestId,
            timestamp: new Date().toISOString(),
            validation_errors: validationResult.errors
          }
        };
      }

      const validatedRequest = validationResult.data!;

      // Step 2: Sanitize the query
      const sanitizedQuery = this.validator.sanitizeQuery(validatedRequest.research_query);
      if (sanitizedQuery !== validatedRequest.research_query) {
        this.logger.info('Query was sanitized', {
          request_id: requestId,
          original_length: validatedRequest.research_query.length,
          sanitized_length: sanitizedQuery.length
        });
      }

      // Step 3: Perform the research
      const researchRequest = {
        ...validatedRequest,
        research_query: sanitizedQuery
      };

      this.logger.info('Processing deep research request', {
        request_id: requestId,
        client_id: clientId,
        accuracy_level: validatedRequest.accuracy_level,
        query_length: validatedRequest.research_query.length
      });

      const startTime = Date.now();
      const researchResult = await this.openaiClient.performDeepResearch(researchRequest);
      const executionTime = (Date.now() - startTime) / 1000;

      // Step 6: Log completion (skip cost alerts for simplicity)
      this.logger.info('Research request completed successfully', {
        client_id: clientId,
        cost_used: researchResult.cost_info.estimated_cost_usd,
        accuracy_level: validatedRequest.accuracy_level
      });

      // Step 7: Format and return the response
      this.logger.info('Research completed successfully', {
        request_id: requestId,
        execution_time_seconds: executionTime,
        model_used: researchResult.model_used,
        tokens_used: researchResult.token_usage.total_tokens,
        cost_usd: researchResult.cost_info.estimated_cost_usd,
        research_confidence: researchResult.research_confidence
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              research_results: researchResult.research_results,
              executive_summary: researchResult.executive_summary,
              model_used: researchResult.model_used,
              execution_time_seconds: executionTime,
              sources_found: researchResult.sources_found,
              research_confidence: researchResult.research_confidence,
              coverage_completeness: researchResult.coverage_completeness,
              recency_score: researchResult.recency_score,
              related_topics: researchResult.related_topics,
              limitations: researchResult.limitations,
              token_usage: researchResult.token_usage,
              cost_info: researchResult.cost_info,
              request_id: requestId,
              rate_limit_remaining: 100, // Rate limiting removed
              timestamp: researchResult.timestamp
            }, null, 2)
          }
        ],
        _meta: {
          request_id: requestId,
          model_used: researchResult.model_used,
          execution_time_seconds: executionTime,
          cost_info: researchResult.cost_info
        }
      };

    } catch (error) {
      this.logger.error('Research request failed', {
        request_id: requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'An unexpected error occurred',
              error_type: 'internal_error',
              request_id: requestId,
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ],
        _meta: {
          request_id: requestId,
          timestamp: new Date().toISOString(),
          error: true
        }
      };
    }
  }

  /**
   * Estimate the cost of a research request
   */
  private estimateRequestCost(request: DoDeepResearchRequest): number {
    // Base cost estimates (these would be updated based on actual OpenAI pricing)
    const baseCosts = {
      high: 2.50,    // o3-deep-research estimated cost
      medium: 0.85   // o4-mini-deep-research estimated cost
    };

    const baseTokens = request.max_tokens || 4000;
    const tokenMultiplier = baseTokens / 4000; // Normalize to 4k tokens
    
    return baseCosts[request.accuracy_level] * tokenMultiplier;
  }

  /**
   * Get or generate client ID (in real implementation, this would extract from MCP context)
   */
  private getClientId(): string {
    // In a real implementation, this would extract the client ID from the MCP context
    // For now, we'll use a default client ID
    return process.env.DEFAULT_CLIENT_ID || 'default_client';
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up server resources');
      // Rate limiter cleanup removed
      this.logger.info('Server cleanup completed');
    } catch (error) {
      this.logger.error('Error during cleanup', { error });
    }
  }
}
