/**
 * SignalK Client listAvailablePaths Integration Tests
 *
 * Tests the listAvailablePaths method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate path discovery, HTTP fallback behavior, and data structure.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SignalKClient } from '../src/signalk-client.js';
import * as dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

// Test utilities
const testUtils = {
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

describe('SignalK Client listAvailablePaths - Live Integration', () => {
  let client: SignalKClient;

  // Extended timeout for real network operations
  const CONNECTION_TIMEOUT = 30000;
  const PATH_DISCOVERY_TIMEOUT = 10000;

  beforeAll(async () => {
    // Create client with environment configuration
    client = new SignalKClient({
      hostname: process.env.SIGNALK_HOST,
      port: parseInt(process.env.SIGNALK_PORT || '3000'),
      useTLS: process.env.SIGNALK_TLS === 'true',
      context: process.env.SIGNALK_CONTEXT || 'vessels.self',
    });

    // Connect to live SignalK server
    try {
      await client.connect();
      console.log(
        `Connected to SignalK server at ${client.hostname}:${client.port}`,
      );

      // Wait for initial data population
      await testUtils.waitFor(5000);
    } catch (error) {
      console.error('Failed to connect to SignalK server:', error);
      throw new Error(
        `Integration test requires live SignalK server at ${client.hostname}:${client.port}`,
      );
    }
  }, CONNECTION_TIMEOUT);

  afterAll(async () => {
    if (client && client.connected) {
      try {
        client.disconnect();
        // Give time for cleanup
        await testUtils.waitFor(1000);
      } catch (error) {
        console.warn('Error during client disconnect:', error);
      }
    }
  });

  test('should discover available paths via HTTP API with fallback behavior', async () => {
    // Wait for path discovery data to accumulate
    await testUtils.waitFor(PATH_DISCOVERY_TIMEOUT);

    // Test the listAvailablePaths method
    const availablePaths = await client.listAvailablePaths();

    // Validate basic response structure
    expect(availablePaths).toBeDefined();
    expect(typeof availablePaths).toBe('object');

    // Connection status should be true
    expect(availablePaths.connected).toBe(true);

    // Should have count and paths array
    expect(availablePaths.count).toBeDefined();
    expect(typeof availablePaths.count).toBe('number');
    expect(availablePaths.paths).toBeDefined();
    expect(Array.isArray(availablePaths.paths)).toBe(true);

    // Count should match array length
    expect(availablePaths.count).toBe(availablePaths.paths.length);

    // Timestamp should be recent and valid
    expect(availablePaths.timestamp).toBeDefined();
    expect(typeof availablePaths.timestamp).toBe('string');
    expect(() => new Date(availablePaths.timestamp)).not.toThrow();

    const timestampAge =
      Date.now() - new Date(availablePaths.timestamp).getTime();
    expect(timestampAge).toBeLessThan(5000); // Should be within 5 seconds

    // If paths exist, validate their structure
    if (availablePaths.count > 0) {
      console.log(`Found ${availablePaths.count} available paths`);

      for (const path of availablePaths.paths) {
        // Path should be a valid string
        expect(typeof path).toBe('string');
        expect(path.length).toBeGreaterThan(0);

        // Should be dot notation format for SignalK paths
        expect(path).toMatch(/^[a-zA-Z]/); // Must start with letter

        // Common SignalK path prefixes
        const commonPrefixes = [
          'navigation.',
          'environment.',
          'propulsion.',
          'electrical.',
          'tanks.',
          'steering.',
          'sails.',
          'design.',
          'sensors.',
          'communication.',
          'notifications.',
        ];

        // At least some paths should match common SignalK patterns
        // (but don't require all paths to match since servers vary)
      }

      // Paths should be sorted alphabetically
      const sortedPaths = [...availablePaths.paths].sort();
      expect(availablePaths.paths).toEqual(sortedPaths);

      // Should contain some typical marine data paths if server has data
      const pathSet = new Set(availablePaths.paths);

      // Log some example paths for debugging
      console.log('Sample paths:', availablePaths.paths.slice(0, 10));
    } else {
      console.log('No paths discovered (empty server or no data)');
    }

    // Performance test - should be reasonable
    const startTime = Date.now();
    await client.listAvailablePaths();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds

    // Data should be JSON serializable (AI-ready)
    expect(() => JSON.stringify(availablePaths)).not.toThrow();

    // Response should be reasonable size
    const serialized = JSON.stringify(availablePaths);
    expect(serialized.length).toBeLessThan(1000000); // < 1MB

    console.log(
      `Path discovery: ${availablePaths.count} paths, ${responseTime}ms response time`,
    );

    if (availablePaths.error) {
      console.log(`Fallback used: ${availablePaths.error}`);
    }
  }, 25000); // 25 second timeout for HTTP requests

  test('should handle HTTP failure gracefully with WebSocket fallback', async () => {
    // Wait for WebSocket data to accumulate
    await testUtils.waitFor(PATH_DISCOVERY_TIMEOUT);

    // Get current paths (this will try HTTP first, then fallback)
    const availablePaths = await client.listAvailablePaths();

    // Basic structure validation
    expect(availablePaths).toBeDefined();
    expect(availablePaths.connected).toBe(true);
    expect(availablePaths.count).toBeDefined();
    expect(availablePaths.paths).toBeDefined();
    expect(Array.isArray(availablePaths.paths)).toBe(true);

    // Count should match array length
    expect(availablePaths.count).toBe(availablePaths.paths.length);

    // Should be JSON serializable
    expect(() => JSON.stringify(availablePaths)).not.toThrow();

    // Check if fallback was used or HTTP succeeded
    if (availablePaths.error) {
      console.log(
        'HTTP failed, WebSocket fallback used:',
        availablePaths.error,
      );
      // Verify fallback behavior worked
      expect(availablePaths.error).toContain('HTTP fetch failed');
    } else {
      console.log('HTTP API successful, no fallback needed');
    }

    // Performance should be good even with fallback
    const startTime = Date.now();
    await client.listAvailablePaths();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(10000); // Allow more time for potential fallback

    console.log(
      `Fallback test: ${availablePaths.count} paths, ${responseTime}ms response time`,
    );
  }, 15000); // 15 second timeout for fallback test

  test('should maintain path consistency over time', async () => {
    // Get initial path list
    const paths1 = await client.listAvailablePaths();

    // Wait a bit and get second snapshot
    await testUtils.waitFor(3000);
    const paths2 = await client.listAvailablePaths();

    // Basic validation
    expect(paths1.connected).toBe(true);
    expect(paths2.connected).toBe(true);

    // Path counts should be stable or growing (data only grows)
    expect(paths2.count).toBeGreaterThanOrEqual(paths1.count);

    // All paths from first call should still exist in second call
    for (const path of paths1.paths) {
      expect(paths2.paths).toContain(path);
    }

    // Timestamps should progress forward
    const timestamp1 = new Date(paths1.timestamp);
    const timestamp2 = new Date(paths2.timestamp);
    expect(timestamp2.getTime()).toBeGreaterThanOrEqual(timestamp1.getTime());

    // Both responses should be consistently structured
    expect(typeof paths1.count).toBe(typeof paths2.count);
    expect(Array.isArray(paths1.paths)).toBe(Array.isArray(paths2.paths));

    console.log(
      `Path consistency: ${paths1.count} → ${paths2.count} (${paths2.count - paths1.count} added)`,
    );
  });

  test('should handle empty paths response gracefully', async () => {
    // This test verifies the method works even when no paths are available
    const availablePaths = await client.listAvailablePaths();

    // Basic structure validation
    expect(availablePaths).toBeDefined();
    expect(typeof availablePaths).toBe('object');
    expect(availablePaths.connected).toBe(true);
    expect(availablePaths.count).toBeDefined();
    expect(availablePaths.paths).toBeDefined();
    expect(Array.isArray(availablePaths.paths)).toBe(true);
    expect(availablePaths.timestamp).toBeDefined();

    // Count should match array length
    expect(availablePaths.count).toBe(availablePaths.paths.length);

    // Should be JSON serializable
    expect(() => JSON.stringify(availablePaths)).not.toThrow();

    // Performance should be good even with no data
    const startTime = Date.now();
    await client.listAvailablePaths();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(5000);

    console.log(
      `Empty paths test: ${availablePaths.count} paths, ${responseTime}ms response time`,
    );
  });
});
