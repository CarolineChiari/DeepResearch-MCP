/**
 * Jest test setup file
 * Configures global test environment for Deep Research MCP Server
 */

// Set test timeout
if (typeof jest !== 'undefined') {
  jest.setTimeout(10000);
}

// Mock console methods in tests to reduce noise
global.console = {
  ...console,
  // Uncomment these to silence logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidMCPResponse(): R;
      toHaveSearchResults(): R;
    }
  }
}

// Custom Jest matchers for MCP responses
expect.extend({
  toBeValidMCPResponse(received: unknown) {
    const pass = 
      typeof received === 'object' &&
      received !== null &&
      'type' in received;
    
    if (pass) {
      return {
        message: () => `Expected ${received} not to be a valid MCP response`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be a valid MCP response`,
        pass: false,
      };
    }
  },
  
  toHaveSearchResults(received: unknown) {
    const pass = 
      typeof received === 'object' &&
      received !== null &&
      'results' in received &&
      Array.isArray((received as any).results);
    
    if (pass) {
      return {
        message: () => `Expected ${received} not to have search results`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to have search results`,
        pass: false,
      };
    }
  },
});

export {};
