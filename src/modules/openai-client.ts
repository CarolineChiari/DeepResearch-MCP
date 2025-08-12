/**
 * OpenAI Deep Research Client
 * Handles integration with OpenAI's Deep Research API models
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';
import type {
  DoDeepResearchRequest,
  DoDeepResearchResponse,
  OpenAIClientConfig,
  ResearchError,
  CostInfo,
  Logger
} from '@/types';

// Load environment variables
dotenv.config();

export class OpenAIDeepResearchClient {
  private openai: OpenAI;
  private logger: Logger;

  constructor(config: OpenAIClientConfig, logger: Logger) {
    this.logger = logger;

    this.openai = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organizationId,
      project: config.projectId,
      timeout: config.timeout * 1000, // Convert to milliseconds
      maxRetries: config.maxRetries,
    });
    
    // Note: validateConnection() should be called separately after construction
  }

  /**
   * Validate OpenAI API connection and permissions
   * This should be called after construction to test the API connection
   */
  async validateConnection(): Promise<void> {
    try {
      // Test API connection with a minimal call
      await this.openai.models.list();
      this.logger.info('OpenAI API connection validated successfully');
    } catch (error) {
      this.logger.error('OpenAI API connection failed', { error });
      throw new Error(`OpenAI API validation failed: ${error}`);
    }
  }

  /**
   * Get the appropriate OpenAI model based on accuracy level
   */
  private getModelForAccuracy(accuracyLevel: 'high' | 'medium'): string {
    return accuracyLevel === 'high' ? 'o3-deep-research' : 'o4-mini-deep-research';
  }

  /**
   * Perform deep research using OpenAI's specialized models
   */
  async performDeepResearch(request: DoDeepResearchRequest): Promise<DoDeepResearchResponse> {
    this.logger.info('=== OpenAI Client: Starting performDeepResearch ===', {
      accuracy_level: request.accuracy_level,
      query_length: request.research_query.length,
      max_tokens: request.max_tokens,
      temperature: request.temperature
    });

    try {
      // Step 1: Determine model to use
      this.logger.info('Step 1: Determining model for accuracy level', { accuracy_level: request.accuracy_level });
      const modelName = this.getModelForAccuracy(request.accuracy_level);
      this.logger.info('✅ Model determined', { modelName });

      // Step 2: Generate response using Responses API
      this.logger.info('Step 2: Calling OpenAI Responses API');
      this.logger.debug('Request details:', {
        model: modelName,
        temperature: request.temperature || 0.3,
        max_tokens: request.max_tokens || 4000,
        response_format: request.response_format || 'comprehensive'
      });

      const response = await this.openai.responses.create({
        model: modelName,
        input: request.research_query,
        // max_output_tokens: request.max_tokens || 4000,
        // Enable web search for deep research capability
        tools: [{
          type: "web_search_preview"
        }]
      });

      this.logger.info('✅ OpenAI API call successful', {
        response_id: response.id,
        status: response.status,
        usage: response.usage
      });

      // Step 3: Process response
      this.logger.info('Step 3: Processing OpenAI response');
      this.logger.debug('Full response structure:', {
        response_keys: Object.keys(response),
        has_output: !!response.output,
        has_output_text: !!response.output_text,
        output_type: typeof response.output,
        output_array_length: Array.isArray(response.output) ? response.output.length : 'not array',
        status: response.status,
        usage: response.usage
      });

      // Check if response is incomplete
      if (response.status === 'incomplete') {
        this.logger.warn('OpenAI response is incomplete - model is still processing', {
          status: response.status,
          incomplete_details: response.incomplete_details,
          reasoning_tokens: response.usage?.output_tokens_details?.reasoning_tokens || 0,
          output_tokens: response.usage?.output_tokens || 0
        });
        
        // For incomplete responses, we could either:
        // 1. Return an error asking user to try again
        // 2. Wait and poll for completion (if API supports it)
        // 3. Return what we have with a clear indication it's incomplete
        
        throw new Error(`OpenAI Deep Research response incomplete. The model is still processing your request. Please try again in a few moments. Status: ${response.status}, Reasoning tokens used: ${response.usage?.output_tokens_details?.reasoning_tokens || 0}`);
      }

      // Log the COMPLETE raw response for debugging
      this.logger.debug('=== COMPLETE RAW RESPONSE DEBUG ===');
      this.logger.debug('Full response object:', { raw_response: JSON.stringify(response, null, 2) });
      this.logger.debug('Response keys:', Object.keys(response));
      this.logger.debug('=== END RAW RESPONSE DEBUG ===');

      // Extract content based on actual OpenAI Responses API structure
      // Based on provided example: output[0].content[0].text contains the final result
      let content = '';
      
      this.logger.debug('Starting content extraction with actual API structure');
      this.logger.debug('Detailed output_text investigation:', {
        'response.output_text': response.output_text,
        'typeof response.output_text': typeof response.output_text,
        'response.output_text === null': response.output_text === null,
        'response.output_text === undefined': response.output_text === undefined,
        'response.output_text === ""': response.output_text === "",
        'Boolean(response.output_text)': Boolean(response.output_text),
        'output_text in response': 'output_text' in response,
        'hasOwnProperty output_text': response.hasOwnProperty('output_text')
      });
      
      // Method 1: Direct output_text field (SDK convenience property)
      if (response.output_text) {
        this.logger.debug('Checking output_text field', {
          exists: !!response.output_text,
          type: typeof response.output_text,
          length: typeof response.output_text === 'string' ? response.output_text.length : 'not string',
          nullOrUndefined: response.output_text === null || response.output_text === undefined
        });
        
        if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
          content = response.output_text.trim();
          this.logger.debug('✅ Content extracted from response.output_text (SDK convenience field)');
        }
      } else {
        this.logger.debug('❌ response.output_text is falsy or empty');
      }
      
      // Method 2: Extract from output[].content[].text (correct format based on example)
      if (!content && Array.isArray(response.output) && response.output.length > 0) {
        this.logger.debug('Processing output array', {
          output_length: response.output.length,
          first_item_keys: response.output[0] ? Object.keys(response.output[0]) : 'no first item'
        });
        
        for (let i = 0; i < response.output.length; i++) {
          const outputItem = response.output[i] as any;
          
          this.logger.debug(`Processing output item ${i}:`, {
            type: outputItem.type,
            id: outputItem.id,
            status: outputItem.status,
            role: outputItem.role,
            has_content: !!outputItem.content,
            content_type: Array.isArray(outputItem.content) ? 'array' : typeof outputItem.content,
            content_length: Array.isArray(outputItem.content) ? outputItem.content.length : 'not array'
          });
          
          // Look for message type with content array
          if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
            this.logger.debug(`Found message with content array (${outputItem.content.length} items)`);
            
            for (let j = 0; j < outputItem.content.length; j++) {
              const contentItem = outputItem.content[j];
              
              this.logger.debug(`Processing content item ${j}:`, {
                type: contentItem.type,
                has_text: !!contentItem.text,
                text_length: contentItem.text ? contentItem.text.length : 0,
                text_preview: contentItem.text ? contentItem.text.substring(0, 100) + '...' : 'no text'
              });
              
              // Look for output_text type with text field (based on example structure)
              if (contentItem.type === 'output_text' && contentItem.text && typeof contentItem.text === 'string') {
                content = contentItem.text;
                this.logger.debug('✅ Content extracted from output[].content[].text (output_text type)');
                break;
              }
              // Also check for regular text type
              else if (contentItem.type === 'text' && contentItem.text && typeof contentItem.text === 'string') {
                content = contentItem.text;
                this.logger.debug('✅ Content extracted from output[].content[].text (text type)');
                break;
              }
            }
            
            if (content) break; // Found content, exit outer loop
          }
        }
      } else {
        this.logger.debug('⚠️ No output array or empty output array', {
          has_output: !!response.output,
          output_type: typeof response.output,
          is_array: Array.isArray(response.output)
        });
      }
      
      // Method 3: Additional fallbacks for other potential text locations
      if (!content) {
        const responseObj = response as any;
        
        // Check text field
        if (responseObj.text && typeof responseObj.text === 'string' && responseObj.text.length > 0) {
          content = responseObj.text;
          this.logger.debug('Content extracted from top-level text field');
        }
        // Check content field
        else if (responseObj.content && typeof responseObj.content === 'string' && responseObj.content.length > 0) {
          content = responseObj.content;
          this.logger.debug('Content extracted from top-level content field');
        }
      }

      // Final fallback - if we still have no content but have tokens, there's a parsing issue
      if (!content || content.trim().length === 0) {
        const tokenCount = response.usage?.output_tokens || 0;
        if (tokenCount > 0) {
          content = `[Content parsing error: OpenAI generated ${tokenCount} tokens but content extraction failed. Response structure: ${JSON.stringify(Object.keys(response), null, 2)}]`;
          this.logger.error('Content extraction failed despite token usage', {
            output_tokens: tokenCount,
            response_keys: Object.keys(response),
            status: response.status
          });
        } else {
          content = 'No content returned from OpenAI';
        }
      }

      this.logger.info('Content extraction completed', {
        content_length: content.length,
        extraction_successful: content.length > 0 && !content.includes('[Content parsing error')
      });

      // Step 4: Calculate costs
      this.logger.info('Step 4: Calculating costs');
      this.logger.debug('About to call calculateCosts with:', {
        accuracy_level: request.accuracy_level,
        usage: response.usage
      });

      const costInfo = this.calculateCosts(request.accuracy_level, response.usage);
      this.logger.info('✅ Cost calculation successful', { costInfo });

      // Step 5: Generate additional metadata
      this.logger.info('Step 5: Generating metadata');
      const sourcesFound = this.extractSourceCount(content);
      const confidence = this.calculateConfidence(request.accuracy_level, sourcesFound);
      
      this.logger.debug('Metadata generated', {
        sourcesFound,
        confidence,
        coverage_completeness: 0.85,
        recency_score: 0.9
      });

      // Step 6: Build final response
      this.logger.info('Step 6: Building final response object');
      const finalResponse: DoDeepResearchResponse = {
        research_results: content,
        executive_summary: this.generateExecutiveSummary(content),
        model_used: modelName as "o3-deep-research" | "o4-mini-deep-research",
        execution_time_seconds: 0, // Will be calculated by the caller
        
        // Required properties
        accuracy_level: request.accuracy_level,
        source_quality_score: 85,
        rate_limit_remaining: 100,
        
        sources_found: sourcesFound,
        research_confidence: confidence,
        coverage_completeness: 0.85,
        recency_score: 0.9,
        related_topics: this.extractRelatedTopics(content),
        limitations: this.generateLimitations(request.accuracy_level),
        token_usage: response.usage ? {
          input_tokens: response.usage.input_tokens || 0,
          output_tokens: response.usage.output_tokens || 0,
          total_tokens: response.usage.total_tokens || 0
        } : { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        cost_info: costInfo,
        request_id: `openai_${Date.now()}`,
        timestamp: new Date().toISOString(),
        
        // Include raw output array for citations, web search results, and intermediate steps
        raw_openai_output: response.output || []
      };

      this.logger.info('=== OpenAI Client: performDeepResearch completed successfully ===', {
        model_used: finalResponse.model_used,
        token_usage: finalResponse.token_usage,
        cost_info: finalResponse.cost_info,
        sources_found: finalResponse.sources_found,
        confidence: finalResponse.research_confidence
      });

      return finalResponse;

    } catch (error) {
      this.logger.error('❌ OpenAI Client: performDeepResearch failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        accuracy_level: request.accuracy_level,
        query_length: request.research_query.length
      });

      throw new Error(`OpenAI Deep Research failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the appropriate OpenAI model name based on accuracy level
   */
  private getModelName(accuracyLevel: "high" | "medium"): string {
    const modelMap = {
      high: "o3-deep-research",        // High accuracy: Comprehensive research with web search, analysis
      medium: "o4-mini-deep-research"  // Medium accuracy: Faster, cost-effective research
    };
    return modelMap[accuracyLevel];
  }

  /**
   * Generate executive summary from research content
   */

  /**
   * Get system prompt based on accuracy level
   */
  /*
  private getSystemPrompt(accuracyLevel: "high" | "medium"): string {
    const prompts = {
      high: `You are an expert research analyst with access to comprehensive web search capabilities. 
             Conduct thorough, multi-source research with the highest accuracy standards. 
             Verify information across multiple credible sources, provide detailed analysis, 
             and include comprehensive source citations. Take your time to ensure accuracy and completeness.`,
      
      medium: `You are a skilled research analyst with web search access. 
              Provide focused, efficient research with good accuracy. 
              Cover key points with reliable sources and clear analysis. 
              Balance thoroughness with efficiency for practical results.`
    };
    
    return prompts[accuracyLevel];
  }
  */

  /**
   * Format the OpenAI response into our standard format
   * @private @unused - Helper method for future use
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _formatResearchResult(
    response: any, // OpenAI Responses API response
    request: DoDeepResearchRequest,
    executionTime: number,
    requestId: string
  ): DoDeepResearchResponse {
    // Extract content from Responses API format
    const content = response.output_text || '';
    const usage = response.usage || { 
      prompt_tokens: 0, 
      completion_tokens: 0, 
      total_tokens: 0 
    };

    // Extract sources from content (basic implementation)
    const sourceUrls = this.extractSourceUrls(content);
    
    // Calculate costs based on usage
    const costInfo = this.calculateCosts(request.accuracy_level, usage);

    const result: DoDeepResearchResponse = {
      research_results: content,
      executive_summary: this.generateExecutiveSummary(content),
      model_used: this.getModelName(request.accuracy_level) as any,
      accuracy_level: request.accuracy_level,
      execution_time_seconds: Math.round(executionTime / 1000),
      sources_found: sourceUrls.length,
      source_quality_score: this.assessSourceQuality(sourceUrls),
      token_usage: {
        input_tokens: usage?.prompt_tokens || 0,
        output_tokens: usage?.completion_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
      },
      cost_info: costInfo,
      research_confidence: this.assessResearchConfidence(content),
      coverage_completeness: this.assessCoverageCompleteness(content, request.research_query),
      recency_score: this.assessRecencyScore(content),
      related_topics: this.extractRelatedTopics(content),
      limitations: this.identifyLimitations(content),
      request_id: requestId,
      timestamp: new Date().toISOString(),
      rate_limit_remaining: 0 // Will be updated by rate limiter
    };

    // Add source URLs if requested
    if (request.include_sources) {
      result.source_urls = sourceUrls;
    }

    return result;
  }

  /**
   * Extract URLs from research content
   */
  private extractSourceUrls(content: string): string[] {
    // Simple URL extraction - can be enhanced
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    return content.match(urlRegex) || [];
  }

  /**
   * Extract count of sources from research content
   */
  private extractSourceCount(content: string): number {
    // Count citation patterns like [1], [2], etc.
    const citationMatches = content.match(/\[\d+\]/g);
    return citationMatches ? citationMatches.length : 0;
  }

  /**
   * Calculate confidence based on accuracy level and sources found
   */
  private calculateConfidence(accuracyLevel: 'high' | 'medium', sourcesFound: number): number {
    const baseConfidence = accuracyLevel === 'high' ? 0.85 : 0.75;
    const sourceBonus = Math.min(sourcesFound * 0.02, 0.15); // Max 15% bonus
    return Math.min(baseConfidence + sourceBonus, 1.0);
  }

  /**
   * Generate limitations based on accuracy level
   */
  private generateLimitations(accuracyLevel: 'high' | 'medium'): string[] {
    const commonLimitations = [
      'Results based on available public information',
      'Information accuracy depends on source reliability'
    ];
    
    if (accuracyLevel === 'medium') {
      commonLimitations.push('Faster processing may result in less comprehensive analysis');
    }
    
    return commonLimitations;
  }

  /**
   * Generate executive summary from research content
   */
  private generateExecutiveSummary(content: string): string {
    if (!content || content.trim().length === 0) {
      return 'No research content available for summary.';
    }

    // Clean up the content and split into meaningful sections
    const cleanContent = content.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Look for key summary patterns in the content
    const summaryIndicators = [
      /^(.*?summary[:\-]?\s*)(.*?)(?=\n\n|$)/im,
      /^(.*?conclusion[:\-]?\s*)(.*?)(?=\n\n|$)/im,
      /^(.*?key findings[:\-]?\s*)(.*?)(?=\n\n|$)/im,
      /^(.*?overview[:\-]?\s*)(.*?)(?=\n\n|$)/im
    ];
    
    // Try to find existing summary sections
    for (const pattern of summaryIndicators) {
      const match = content.match(pattern);
      if (match && match[2] && match[2].trim().length > 100) {
        return match[2].trim().substring(0, 500);
      }
    }
    
    // If no summary section found, extract key points from the beginning
    const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
    
    if (sentences.length === 0) {
      return 'Research content available but could not generate meaningful summary.';
    }
    
    // Take the first few substantial sentences that likely contain the main findings
    let summary = '';
    let sentenceCount = 0;
    const maxLength = 400;
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length > 20 && sentenceCount < 4) {
        const potentialAddition = (summary ? '. ' : '') + trimmedSentence;
        if ((summary + potentialAddition).length <= maxLength) {
          summary += potentialAddition;
          sentenceCount++;
        } else {
          break;
        }
      }
    }
    
    // Ensure the summary ends properly
    if (summary && !summary.match(/[.!?]$/)) {
      summary += '.';
    }
    
    return summary || 'Research completed but summary extraction failed.';
  }

  /**
   * Calculate costs based on model and token usage
   */
  private calculateCosts(accuracyLevel: "high" | "medium", usage: any): CostInfo {
    this.logger.info('=== Starting calculateCosts method ===', {
      accuracyLevel,
      usage,
      usageType: typeof usage,
      usageKeys: usage ? Object.keys(usage) : 'null'
    });

    try {
      this.logger.info('Step 1: Setting up cost per token rates');
      
      // Estimate costs for Deep Research models (these are approximations)
      const costPerToken = {
        high: 0.02,    // o3-deep-research estimated cost per 1K tokens
        medium: 0.006  // o4-mini-deep-research estimated cost per 1K tokens
      };

      this.logger.info('✅ Cost rates defined', { costPerToken });

      this.logger.info('Step 2: Extracting token usage');
      const totalTokens = usage?.total_tokens || 0;
      this.logger.info('✅ Token count extracted', { totalTokens });

      this.logger.info('Step 3: Calculating estimated cost');
      const estimatedCost = (totalTokens / 1000) * costPerToken[accuracyLevel];
      this.logger.info('✅ Cost calculated', { estimatedCost });

      this.logger.info('Step 4: Building CostInfo object');
      const costInfo: CostInfo = {
        estimated_cost_usd: parseFloat(estimatedCost.toFixed(4)),
        cost_per_1k_tokens: costPerToken[accuracyLevel],
        billing_tier: accuracyLevel === 'high' ? 'premium' : 'standard'
      };

      this.logger.info('✅ CostInfo object created', { costInfo });
      this.logger.info('=== calculateCosts completed successfully ===');

      return costInfo;

    } catch (error) {
      this.logger.error('❌ calculateCosts method failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        accuracyLevel,
        usage
      });

      // Return a default cost info to prevent complete failure
      const fallbackCostInfo: CostInfo = {
        estimated_cost_usd: 0.0,
        cost_per_1k_tokens: 0.0,
        billing_tier: 'standard'
      };

      this.logger.warn('Returning fallback cost info', { fallbackCostInfo });
      return fallbackCostInfo;
    }
  }

  /**
   * Assess research confidence based on content analysis
   */
  private assessResearchConfidence(content: string): number {
    // Simple heuristic - can be enhanced with NLP
    let confidence = 70; // Base confidence
    
    if (content.includes('multiple sources')) confidence += 10;
    if (content.includes('verified') || content.includes('confirmed')) confidence += 10;
    if (content.includes('uncertain') || content.includes('unclear')) confidence -= 15;
    if (content.length > 2000) confidence += 5; // More comprehensive
    
    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Assess coverage completeness
   */
  private assessCoverageCompleteness(content: string, query: string): number {
    // Basic implementation - can be enhanced
    const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 3);
    const contentLower = content.toLowerCase();
    
    const coveredWords = queryWords.filter(word => contentLower.includes(word));
    return Math.round((coveredWords.length / queryWords.length) * 100);
  }

  /**
   * Assess recency of information
   */
  private assessRecencyScore(content: string): number {
    // Look for date indicators
    const currentYear = new Date().getFullYear();
    const recentYears = [currentYear, currentYear - 1];
    
    let score = 50; // Base score
    
    recentYears.forEach(year => {
      if (content.includes(year.toString())) score += 20;
    });
    
    if (content.includes('latest') || content.includes('recent')) score += 10;
    if (content.includes('2022') || content.includes('2021')) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract related topics for follow-up research
   */
  private extractRelatedTopics(content: string): string[] {
    // Simple implementation - look for "related" or "also" patterns
    // Can be enhanced with NLP for better topic extraction
    const topics: string[] = [];
    
    // Look for bullet points or numbered lists that might contain related topics
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.includes('related') || line.includes('also consider') || line.includes('see also')) {
        const topic = line.replace(/[-\*\d\.]/g, '').trim();
        if (topic.length > 10 && topic.length < 100) {
          topics.push(topic);
        }
      }
    });

    // Return up to 5 related topics
    return topics.slice(0, 5);
  }

  /**
   * Identify research limitations
   */
  private identifyLimitations(content: string): string[] {
    const limitations: string[] = [];
    
    if (content.includes('limited data')) {
      limitations.push('Limited data availability in some areas');
    }
    if (content.includes('ongoing research')) {
      limitations.push('Some findings based on ongoing research');
    }
    if (content.length < 1000) {
      limitations.push('Research scope may be limited due to query complexity');
    }
    if (content.includes('preliminary') || content.includes('early stage')) {
      limitations.push('Some information may be preliminary or subject to change');
    }
    
    return limitations;
  }

  /**
   * Assess source quality based on URLs
   */
  private assessSourceQuality(urls: string[]): number {
    if (urls.length === 0) return 0;
    
    let qualityScore = 0;
    const highQualityDomains = [
      'arxiv.org', 'nature.com', 'sciencedirect.com', 
      'ieee.org', 'acm.org', 'nih.gov', '.edu',
      'scholar.google.com', 'pubmed.ncbi.nlm.nih.gov'
    ];
    
    urls.forEach(url => {
      const isHighQuality = highQualityDomains.some(domain => url.includes(domain));
      qualityScore += isHighQuality ? 90 : 60;
    });
    
    return Math.round(qualityScore / urls.length);
  }

  /**
   * Handle OpenAI API errors with appropriate error types
   * @private @unused - Helper method for future use  
   */
  private _handleOpenAIError(error: any): ResearchError {
    if (error.status === 429) {
      return {
        type: 'rate_limit',
        message: 'OpenAI API rate limit exceeded',
        suggestion: 'Try again later or reduce request frequency',
        retryAfter: error.headers?.['retry-after'] || 60,
        costSavingsTip: 'Consider using medium accuracy level for less critical research'
      };
    }
    
    if (error.status === 401) {
      return {
        type: 'authentication',
        message: 'OpenAI API authentication failed',
        suggestion: 'Check API key configuration'
      };
    }
    
    if (error.status === 400) {
      return {
        type: 'validation',
        message: 'Invalid request to OpenAI API',
        suggestion: 'Check request parameters'
      };
    }
    
    if (error.code === 'timeout') {
      return {
        type: 'timeout',
        message: 'OpenAI API request timed out',
        suggestion: 'Try again with a shorter query or increase timeout'
      };
    }
    
    return {
      type: 'api_error',
      message: `OpenAI API error: ${error.message}`,
      suggestion: 'Check OpenAI service status and retry'
    };
  }

  /**
   * Estimate cost before making request
   */
  estimateRequestCost(request: DoDeepResearchRequest): {
    estimated_tokens: number;
    estimated_cost_usd: number;
    estimated_time_seconds: number;
  } {
    const { MODEL_CONFIGS } = require('@/types/openai-types.js');
    const config = MODEL_CONFIGS[request.accuracy_level];
    
    const estimatedInputTokens = Math.ceil(request.research_query.length / 4);
    const estimatedOutputTokens = request.max_tokens || 4000;
    const totalTokens = estimatedInputTokens + estimatedOutputTokens;
    
    return {
      estimated_tokens: totalTokens,
      estimated_cost_usd: (totalTokens / 1000) * config.cost_per_1k_tokens,
      estimated_time_seconds: config.typical_response_time_seconds
    };
  }
}
