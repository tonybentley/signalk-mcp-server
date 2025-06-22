/**
 * Jest test setup file
 * 
 * This file runs before each test suite and provides:
 * - Global test utilities for unit tests
 * - Configure test environment
 * - Set up mocks that apply to all tests
 */

import { jest, afterEach } from '@jest/globals';

// Extend global types
declare global {
  var testUtils: {
    restoreConsole: () => void;
    mockConsole: () => void;
    createSampleDelta: (context?: string, path?: string, value?: any) => any;
    waitFor: (ms?: number) => Promise<void>;
    createMockWebSocket: () => any;
  };
}

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests unless explicitly testing them
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

// Only suppress logs in test environment
if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
  console.error = jest.fn();
  console.log = jest.fn();
}

// Global test utilities
global.testUtils = {
  // Restore console for specific tests that need to verify console output
  restoreConsole: () => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  },
  
  // Mock console for tests that need to verify console output
  mockConsole: () => {
    console.error = jest.fn();
    console.log = jest.fn();
  },
  
  // Create sample SignalK delta message
  createSampleDelta: (context = 'vessels.self', path = 'navigation.position', value = { latitude: 37.8199, longitude: -122.4783 }) => ({
    context,
    updates: [{
      timestamp: new Date().toISOString(),
      source: { label: 'GPS1', type: 'NMEA0183' },
      values: [{
        path,
        value
      }]
    }]
  }),
  
  // Wait for async operations
  waitFor: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock WebSocket
  createMockWebSocket: () => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1 // WebSocket.OPEN
  })
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in tests:', reason);
});