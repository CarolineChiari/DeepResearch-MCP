/**
 * Main server entry point for OpenAI Deep Research MCP Server
 * Starts the MCP server and handles graceful shutdown
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { createContextLogger } from './modules/logger.js';
import { OpenAIDeepResearchMCPServer } from './modules/mcp-server.js';

// Load environment variables
dotenv.config();

// Set MCP server mode to enable file-only logging
process.env.MCP_SERVER_MODE = 'true';

/**
 * Initialize and start the OpenAI Deep Research MCP Server
 */
async function main(): Promise<void> {
  const logger = createContextLogger({ component: 'MainServer' });
  
  try {
    logger.info('=== STARTING OPENAI DEEP RESEARCH MCP SERVER ===');

    // Validate required environment variables
    logger.info('Step 1: Validating environment variables');
    const requiredEnvVars = [
      'OPENAI_API_KEY'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        logger.error(`❌ Missing required environment variable: ${envVar}`);
        throw new Error(`Required environment variable ${envVar} is not set`);
      } else {
        logger.info(`✅ Environment variable ${envVar} is present`);
      }
    }

    // Create and initialize the MCP server
    logger.info('Step 2: Creating MCP server instance');
    const mcpServer = new OpenAIDeepResearchMCPServer();
    
    logger.info('Step 3: Initializing MCP server');
    await mcpServer.initialize();
    logger.info('✅ MCP server initialized successfully');

    // Create transport for stdio communication
    logger.info('Step 4: Creating STDIO transport');
    const transport = new StdioServerTransport();
    logger.info('✅ STDIO transport created');

    // Connect server to transport
    logger.info('Step 5: Connecting server to transport');
    await mcpServer.getServer().connect(transport);
    logger.info('✅ Server connected to transport');
    
    logger.info('=== OPENAI DEEP RESEARCH MCP SERVER STARTED SUCCESSFULLY ===');
    logger.info('Server configuration', {
      name: 'openai-deep-research-mcp-server',
      version: '1.0.0',
      tools: ['do_deep_research'],
      openai_models: ['o3-deep-research', 'o4-mini-deep-research'],
      environment_variables: {
        OPENAI_API_KEY: '***SET***',
        OPENAI_ORG_ID: process.env.OPENAI_ORG_ID ? '***SET***' : 'NOT_SET',
        OPENAI_PROJECT_ID: process.env.OPENAI_PROJECT_ID ? '***SET***' : 'NOT_SET'
      }
    });

    logger.info('🚀 Server is ready to handle requests via STDIO');

  } catch (error) {
    logger.error('❌ Failed to start server', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(): void {
  const logger = createContextLogger({ component: 'Shutdown' });
  
  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    
    // Perform cleanup operations
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { 
      reason, 
      promise: promise.toString() 
    });
    process.exit(1);
  });
}

// Setup shutdown handlers
setupGracefulShutdown();

// Start the server
main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
