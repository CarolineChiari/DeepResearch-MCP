/**
 * TypeScript type definitions for OpenAI Deep Research MCP Server
 * Central export point for all type definitions
 */

// Re-export all OpenAI Deep Research types
export * from './openai-types.js';

// Core MCP Types (keep existing MCP protocol types)
export interface MCPToolResponse {
  [x: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
    _meta?: { [x: string]: unknown } | undefined;
  }>;
  _meta?: { [x: string]: unknown } | undefined;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// Logger Interface (keep for backwards compatibility)
export interface Logger {
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  debug(message: string, meta?: object): void;
  child(meta: object): Logger;
}
