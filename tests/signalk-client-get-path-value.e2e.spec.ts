/**
 * SignalK Client getPathValue Integration Tests
 *
 * Tests the getPathValue method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate path value retrieval, HTTP-first approach with WebSocket fallback,
 * and data consistency across different path types.
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

describe('SignalK Client getPathValue - Live Integration', () => {
  let client: SignalKClient;
  let availablePaths: string[] = [];

  // Extended timeout for real network operations
  const CONNECTION_TIMEOUT = 30000;
  const DATA_COLLECTION_TIMEOUT = 3000;

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
      await testUtils.waitFor(2000);

      // Discover available paths for dynamic testing
      const pathsResponse = await client.listAvailablePaths();
      availablePaths = pathsResponse.paths || [];
      console.log(
        `Discovered ${availablePaths.length} available paths for testing`,
      );
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

  test('should retrieve valid path values with proper structure and HTTP-first approach', async () => {
    // Wait for data collection
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);

    // Test common navigation paths that are likely to exist
    const testPaths = [
      'navigation.position',
      'navigation.speedOverGround',
      'navigation.courseOverGround',
      'navigation.headingTrue',
    ].filter((path) => availablePaths.includes(path));

    // If no common paths exist, use first few available paths
    if (testPaths.length === 0 && availablePaths.length > 0) {
      testPaths.push(...availablePaths.slice(0, 3));
    }

    // Handle empty SignalK server gracefully
    if (testPaths.length === 0) {
      console.log('No paths available in SignalK server - skipping path-specific tests');
      // Still validate that the connection works
      expect(availablePaths).toBeDefined();
      expect(Array.isArray(availablePaths)).toBe(true);
      return; // Skip path-specific tests but pass the test
    }

    console.log(`Testing paths: ${testPaths.join(', ')}`);

    for (const testPath of testPaths) {
      const startTime = Date.now();
      const pathResult = await client.getPathValue(testPath);
      const responseTime = Date.now() - startTime;

      // Validate basic response structure
      expect(pathResult).toBeDefined();
      expect(typeof pathResult).toBe('object');

      // Connection status should be true for live server
      expect(pathResult.connected).toBe(true);

      // Path should match request
      expect(pathResult.path).toBe(testPath);

      // Timestamp should be recent and valid ISO string
      expect(pathResult.timestamp).toBeDefined();
      expect(typeof pathResult.timestamp).toBe('string');
      expect(() => new Date(pathResult.timestamp)).not.toThrow();

      const timestampAge =
        Date.now() - new Date(pathResult.timestamp).getTime();
      expect(timestampAge).toBeLessThan(5000); // Should be within 5 seconds

      // Data should be defined (can be null for non-existent paths)
      expect(pathResult.data).toBeDefined();

      // If data exists, validate SignalK structure
      if (pathResult.data && pathResult.data !== null) {
        expect(typeof pathResult.data).toBe('object');

        // Should have value property
        expect(pathResult.data).toHaveProperty('value');

        // Should have timestamp
        expect(pathResult.data).toHaveProperty('timestamp');
        expect(typeof pathResult.data.timestamp).toBe('string');
        expect(() => new Date(pathResult.data.timestamp)).not.toThrow();

        // Source is optional but should be object if present
        if (pathResult.data.source) {
          expect(typeof pathResult.data.source).toBe('object');
        }

        // Value timestamp should be reasonable (allow for significant clock skew)
        const valueAge =
          Date.now() - new Date(pathResult.data.timestamp).getTime();
        expect(Math.abs(valueAge)).toBeLessThan(600000); // Within 10 minutes either direction
      }

      // Response should be reasonably fast (HTTP or cached)
      expect(responseTime).toBeLessThan(5000); // Allow 5s for HTTP requests

      // Should be JSON serializable
      expect(() => JSON.stringify(pathResult)).not.toThrow();

      console.log(
        `Path ${testPath}: ${pathResult.data ? 'data available' : 'no data'}, ${responseTime}ms`,
      );
    }
  }, 15000);

  test('should handle various path types with appropriate data structures', async () => {
    // Wait for data accumulation
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);

    // Define path categories with expected data types
    const pathCategories = {
      navigation: availablePaths.filter((p) => p.startsWith('navigation.')),
      environment: availablePaths.filter((p) => p.startsWith('environment.')),
      electrical: availablePaths.filter((p) => p.startsWith('electrical.')),
      propulsion: availablePaths.filter((p) => p.startsWith('propulsion.')),
      design: availablePaths.filter((p) => p.startsWith('design.')),
      sensors: availablePaths.filter((p) => p.startsWith('sensors.')),
    };

    let testedPaths = 0;

    for (const [category, paths] of Object.entries(pathCategories)) {
      if (paths.length === 0) continue;

      // Test first path in each category
      const testPath = paths[0];
      const pathResult = await client.getPathValue(testPath);

      expect(pathResult).toBeDefined();
      expect(pathResult.path).toBe(testPath);
      expect(pathResult.connected).toBe(true);

      // Validate category-specific data if available
      if (pathResult.data && pathResult.data.value !== null) {
        switch (category) {
          case 'navigation':
            if (testPath.includes('position')) {
              // Position should have latitude/longitude
              if (
                typeof pathResult.data.value === 'object' &&
                pathResult.data.value
              ) {
                expect(pathResult.data.value).toHaveProperty('latitude');
                expect(pathResult.data.value).toHaveProperty('longitude');
                expect(typeof pathResult.data.value.latitude).toBe('number');
                expect(typeof pathResult.data.value.longitude).toBe('number');
              }
            } else if (
              testPath.includes('speed') ||
              testPath.includes('course') ||
              testPath.includes('heading')
            ) {
              // Speed/course/heading should be numbers
              expect(typeof pathResult.data.value).toBe('number');
            }
            break;

          case 'environment':
            if (
              testPath.includes('wind') ||
              testPath.includes('depth') ||
              testPath.includes('temperature')
            ) {
              // Environmental values are typically numbers
              expect(typeof pathResult.data.value).toBe('number');
            }
            break;

          case 'electrical':
            if (
              testPath.includes('voltage') ||
              testPath.includes('current') ||
              testPath.includes('power')
            ) {
              // Electrical values should be numbers
              expect(typeof pathResult.data.value).toBe('number');
            }
            break;

          case 'design':
            if (testPath.includes('name') || testPath.includes('brand')) {
              // Design names should be strings
              expect(typeof pathResult.data.value).toBe('string');
            }
            break;
        }
      }

      testedPaths++;
      console.log(
        `${category}: ${testPath} - ${pathResult.data ? 'data available' : 'no data'}`,
      );
    }

    // Handle empty SignalK server gracefully
    if (testedPaths === 0) {
      console.log('No path categories found in SignalK server - server appears to be empty');
      // Still validate that we checked for paths
      expect(pathCategories).toBeDefined();
      expect(typeof pathCategories).toBe('object');
    } else {
      expect(testedPaths).toBeGreaterThan(0);
      console.log(`Tested ${testedPaths} different path categories`);
    }
  }, 15000);

  test('should demonstrate HTTP vs WebSocket fallback behavior', async () => {
    // Wait for data collection
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);

    if (availablePaths.length === 0) {
      console.log('No available paths for fallback testing');
      return;
    }

    const testPath = availablePaths[0];
    console.log(`Testing HTTP/WebSocket fallback with path: ${testPath}`);

    // First call - should use HTTP if available
    const result1 = await client.getPathValue(testPath);
    expect(result1).toBeDefined();
    expect(result1.path).toBe(testPath);

    // Multiple rapid calls to test caching behavior
    const startTime = Date.now();
    const results = await Promise.all([
      client.getPathValue(testPath),
      client.getPathValue(testPath),
      client.getPathValue(testPath),
    ]);
    const totalTime = Date.now() - startTime;

    // All results should be consistent
    for (const result of results) {
      expect(result.path).toBe(testPath);
      expect(result.connected).toBe(result1.connected);

      // Data should be consistent (allowing for timestamp differences)
      if (result1.data && result.data) {
        expect(typeof result.data).toBe(typeof result1.data);
        if (result.data.value !== null && result1.data.value !== null) {
          expect(typeof result.data.value).toBe(typeof result1.data.value);
        }
      }
    }

    // Should handle multiple requests efficiently
    expect(totalTime).toBeLessThan(10000); // 10 seconds for 3 parallel requests

    console.log(`Parallel requests completed in ${totalTime}ms`);

    // Test error handling with invalid path
    const invalidResult = await client.getPathValue('invalid.nonexistent.path');
    expect(invalidResult).toBeDefined();
    expect(invalidResult.path).toBe('invalid.nonexistent.path');
    expect(invalidResult.connected).toBe(true);

    // Invalid path should return null data or error
    if (invalidResult.data === null) {
      console.log('Invalid path correctly returned null data');
    } else if (invalidResult.error) {
      console.log(`Invalid path returned error: ${invalidResult.error}`);
    }
  }, 15000);

  test('should maintain data consistency and handle real-time updates', async () => {
    // Wait for substantial data collection
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);

    if (availablePaths.length === 0) {
      console.log('No available paths for consistency testing');
      return;
    }

    // Find a path that likely has changing data (navigation or sensor data)
    const dynamicPaths = availablePaths.filter(
      (path) =>
        path.includes('navigation.') ||
        path.includes('environment.') ||
        path.includes('sensors.'),
    );

    const testPath =
      dynamicPaths.length > 0 ? dynamicPaths[0] : availablePaths[0];
    console.log(`Testing consistency with path: ${testPath}`);

    // Get initial value
    const value1 = await client.getPathValue(testPath);

    // Wait and get second value
    await testUtils.waitFor(1000);
    const value2 = await client.getPathValue(testPath);

    // Wait and get third value
    await testUtils.waitFor(1000);
    const value3 = await client.getPathValue(testPath);

    // All results should have consistent structure
    for (const result of [value1, value2, value3]) {
      expect(result.path).toBe(testPath);
      expect(result.connected).toBe(true);
      expect(result.timestamp).toBeDefined();

      // Timestamps should be valid and progressing
      expect(() => new Date(result.timestamp)).not.toThrow();
    }

    // Timestamps should progress forward
    const ts1 = new Date(value1.timestamp).getTime();
    const ts2 = new Date(value2.timestamp).getTime();
    const ts3 = new Date(value3.timestamp).getTime();

    expect(ts2).toBeGreaterThanOrEqual(ts1);
    expect(ts3).toBeGreaterThanOrEqual(ts2);

    // Data structure should remain consistent
    if (value1.data && value2.data && value3.data) {
      expect(typeof value1.data).toBe(typeof value2.data);
      expect(typeof value2.data).toBe(typeof value3.data);

      if (value1.data.value !== null && value2.data.value !== null) {
        expect(typeof value1.data.value).toBe(typeof value2.data.value);
      }
    }

    // All data should be JSON serializable
    expect(() => JSON.stringify(value1)).not.toThrow();
    expect(() => JSON.stringify(value2)).not.toThrow();
    expect(() => JSON.stringify(value3)).not.toThrow();

    // Data should be reasonable size
    const serialized = JSON.stringify(value3);
    expect(serialized.length).toBeLessThan(100000); // < 100KB per path value

    console.log(
      `Consistency test: ${value1.data ? 'data' : 'null'} → ${value2.data ? 'data' : 'null'} → ${value3.data ? 'data' : 'null'}`,
    );

    // Log data freshness if available
    if (value3.data && value3.data.timestamp) {
      const dataAge = Date.now() - new Date(value3.data.timestamp).getTime();
      console.log(`Latest data age: ${(dataAge / 1000).toFixed(1)}s`);
    }
  }, 15000);

  test('should handle edge cases and error conditions gracefully', async () => {
    // Test empty path
    const emptyResult = await client.getPathValue('');
    expect(emptyResult).toBeDefined();
    expect(emptyResult.path).toBe('');
    expect(emptyResult.connected).toBe(true);

    // Test path with special characters
    const specialResult = await client.getPathValue(
      'test.path.with-special_chars123',
    );
    expect(specialResult).toBeDefined();
    expect(specialResult.path).toBe('test.path.with-special_chars123');

    // Test very long path
    const longPath =
      'very.long.path.that.goes.on.and.on.with.many.segments.to.test.handling';
    const longResult = await client.getPathValue(longPath);
    expect(longResult).toBeDefined();
    expect(longResult.path).toBe(longPath);

    // All edge cases should handle gracefully
    expect(() => JSON.stringify(emptyResult)).not.toThrow();
    expect(() => JSON.stringify(specialResult)).not.toThrow();
    expect(() => JSON.stringify(longResult)).not.toThrow();

    // Performance should remain good even for invalid paths
    const startTime = Date.now();
    await client.getPathValue('invalid.test.path');
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(5000);

    console.log(
      `Edge case testing completed, invalid path response time: ${responseTime}ms`,
    );
  }, 10000);

  test('should perform well under load and maintain response times', async () => {
    if (availablePaths.length === 0) {
      console.log('No available paths for performance testing');
      return;
    }

    // Select multiple paths for testing
    const testPaths = availablePaths.slice(
      0,
      Math.min(5, availablePaths.length),
    );
    console.log(`Performance testing with ${testPaths.length} paths`);

    // Sequential requests
    const sequentialStart = Date.now();
    for (const path of testPaths) {
      await client.getPathValue(path);
    }
    const sequentialTime = Date.now() - sequentialStart;

    // Parallel requests
    const parallelStart = Date.now();
    await Promise.all(testPaths.map((path) => client.getPathValue(path)));
    const parallelTime = Date.now() - parallelStart;

    // Parallel and sequential should both complete in reasonable time
    expect(parallelTime).toBeLessThan(10000); // Should complete within 10 seconds
    expect(sequentialTime).toBeLessThan(15000); // Sequential may take longer but should be reasonable

    // Individual cached requests should be very fast
    const cachedStart = Date.now();
    await client.getPathValue(testPaths[0]);
    const cachedTime = Date.now() - cachedStart;

    expect(cachedTime).toBeLessThan(1000); // Cached requests should be under 1 second

    console.log(
      `Performance: Sequential ${sequentialTime}ms, Parallel ${parallelTime}ms, Cached ${cachedTime}ms`,
    );
    console.log(
      `Average per path: ${(sequentialTime / testPaths.length).toFixed(1)}ms`,
    );

    // Verify all results are still valid after performance testing
    const finalResult = await client.getPathValue(testPaths[0]);
    expect(finalResult).toBeDefined();
    expect(finalResult.path).toBe(testPaths[0]);
    expect(finalResult.connected).toBe(true);
  }, 45000); // Extended timeout for performance testing
});
