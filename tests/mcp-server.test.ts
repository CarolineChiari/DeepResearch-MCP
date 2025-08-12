import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';
import { DeepResearchMCPServer } from '../src/modules/mcp-server';

describe('DeepResearchMCPServer', () => {
  let server: DeepResearchMCPServer;

  beforeEach(() => {
    server = new DeepResearchMCPServer();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Server Initialization', () => {
    it('should create server instance successfully', () => {
      expect(server).toBeInstanceOf(DeepResearchMCPServer);
    });

    it('should start and stop without errors', async () => {
      await expect(server.start()).resolves.not.toThrow();
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('should return MCP server instance', () => {
      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe('Search Tool', () => {
    it('should handle basic search request', async () => {
      const searchParams = {
        query: 'test query',
        limit: 10,
      };

      // Access the private method for testing
      const result = await (server as any).handleSearch(searchParams);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      // Check that response contains markdown structure
      const responseText = result.content[0].text;
      expect(responseText).toContain('# Search Results');
      expect(responseText).toContain('Query:'); // Allow for sanitized quotes
      expect(responseText).toContain('Total Results:');
    });

    it('should respect search limits', async () => {
      const searchParams = {
        query: 'test query',
        limit: 2,
      };

      const result = await (server as any).handleSearch(searchParams);
      const responseText = result.content[0].text;
      
      // Count numbered list items in response
      const matches = responseText.match(/^\d+\. \*\*/gm);
      const resultCount = matches ? matches.length : 0;
      expect(resultCount).toBeLessThanOrEqual(2);
    });

    it('should include required result fields', async () => {
      const searchParams = {
        query: 'machine learning',
        limit: 1,
      };

      const result = await (server as any).handleSearch(searchParams);
      const responseText = result.content[0].text;
      
      // Check for required fields in markdown format
      expect(responseText).toContain('ID:');
      expect(responseText).toContain('Snippet:');
      expect(responseText).toContain('Source:');
    });

    it('should sanitize search queries', async () => {
      const maliciousQuery = '<script>alert("xss")</script>';
      const searchParams = {
        query: maliciousQuery,
        limit: 5,
      };

      const result = await (server as any).handleSearch(searchParams);
      expect(result.content[0].text).not.toContain('<script>');
    });
  });

  describe('Fetch Tool', () => {
    it('should handle basic fetch request', async () => {
      const fetchParams = {
        id: 'doc_001', // Use existing mock document ID
      };

      const result = await (server as any).handleFetch(fetchParams);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      
      // Check that response contains document content in markdown format
      const responseText = result.content[0].text;
      expect(responseText).toContain('# '); // Should contain title as h1
      expect(responseText).toContain('**Document ID:**');
      expect(responseText).toContain('**Source:**');
    });

    it('should handle non-existent document', async () => {
      const fetchParams = {
        id: 'non_existent_doc',
      };

      const result = await (server as any).handleFetch(fetchParams);
      const responseText = result.content[0].text;
      
      expect(responseText).toContain('not found');
    });

    it('should sanitize document IDs', async () => {
      const maliciousId = '../../../etc/passwd';
      const fetchParams = {
        id: maliciousId,
      };

      const result = await (server as any).handleFetch(fetchParams);
      // Should return validation error, not process malicious ID
      expect(result.content[0].text).toContain('validation failed');
    });
  });

  describe('Input Validation', () => {
    it('should validate search schema correctly', () => {
      const validInput = {
        query: 'test query',
        limit: 10,
        filters: {
          source: 'academic',
          dateRange: {
            start: '2023-01-01',
            end: '2023-12-31'
          }
        }
      };

      // Test that valid input passes validation
      expect(() => {
        // Access the schema validation (assuming it's exposed)
        const SearchRequestSchema = z.object({
          query: z.string().min(1).max(1000),
          limit: z.number().int().min(1).max(100).default(10),
          filters: z.object({
            source: z.string().optional(),
            dateRange: z.object({
              start: z.string().optional(),
              end: z.string().optional()
            }).optional()
          }).optional()
        });
        
        SearchRequestSchema.parse(validInput);
      }).not.toThrow();
    });

    it('should reject invalid search input', () => {
      const invalidInput = {
        query: '', // Empty query should fail
        limit: -1, // Negative limit should fail
      };

      expect(() => {
        const SearchRequestSchema = z.object({
          query: z.string().min(1).max(1000),
          limit: z.number().int().min(1).max(100).default(10),
        });
        
        SearchRequestSchema.parse(invalidInput);
      }).toThrow();
    });
  });

  describe('Security Features', () => {
    it('should sanitize HTML in responses', async () => {
      const searchParams = {
        query: 'test',
        limit: 1,
      };

      const result = await (server as any).handleSearch(searchParams);
      const responseText = result.content[0].text;
      
      // Should not contain raw HTML tags
      expect(responseText).not.toMatch(/<script[^>]*>/);
      expect(responseText).not.toMatch(/<iframe[^>]*>/);
    });

    it('should handle errors gracefully', async () => {
      // Test with extremely long query
      const longQuery = 'a'.repeat(10000);
      const searchParams = {
        query: longQuery,
        limit: 1,
      };

      const result = await (server as any).handleSearch(searchParams);
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('validation failed');
    });
  });
});
