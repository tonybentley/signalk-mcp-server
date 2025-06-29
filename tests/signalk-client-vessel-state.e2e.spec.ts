/**
 * SignalK Client getVesselState Integration Tests
 *
 * Tests the getVesselState method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate data structure and behavior without assuming specific paths.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SignalKClient } from '../src/signalk-client.js';
import dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

describe('SignalK Client getVesselState - Live Integration', () => {
  let client: SignalKClient;

  // Extended timeout for real network operations
  const CONNECTION_TIMEOUT = 30000;
  const DATA_COLLECTION_TIMEOUT = 10000;

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

  test('should connect to live server and return valid vessel state structure', async () => {
    // Test basic connection and structure
    const vesselState = client.getVesselState();

    // Validate basic response structure
    expect(vesselState).toBeDefined();
    expect(typeof vesselState).toBe('object');

    // Connection status should be true for live server
    expect(vesselState.connected).toBe(true);

    // Context should match configuration
    expect(vesselState.context).toBe(
      process.env.SIGNALK_CONTEXT || 'vessels.self',
    );

    // Timestamp should be recent and valid ISO string
    expect(vesselState.timestamp).toBeDefined();
    expect(typeof vesselState.timestamp).toBe('string');
    expect(() => new Date(vesselState.timestamp)).not.toThrow();

    const timestampAge = Date.now() - new Date(vesselState.timestamp).getTime();
    expect(timestampAge).toBeLessThan(5000); // Should be within 5 seconds

    // Data should be an object
    expect(vesselState.data).toBeDefined();
    expect(typeof vesselState.data).toBe('object');

    // Response should be fast (cached data)
    const startTime = Date.now();
    client.getVesselState();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(100);

    // If data exists, validate SignalK structure
    if (Object.keys(vesselState.data).length > 0) {
      for (const [path, signalKValue] of Object.entries(vesselState.data)) {
        // Path should be dot notation string (allowing numbers, underscores, and dashes in path names)
        expect(typeof path).toBe('string');
        expect(path).toMatch(
          /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*$/,
        );

        // SignalK value structure validation
        expect(signalKValue).toBeDefined();
        expect(typeof signalKValue).toBe('object');
        expect(signalKValue).toHaveProperty('value');
        expect(signalKValue).toHaveProperty('timestamp');

        // Timestamp should be valid
        expect(typeof signalKValue.timestamp).toBe('string');
        expect(() => new Date(signalKValue.timestamp)).not.toThrow();

        // Source is optional but should be object if present
        if (signalKValue.source) {
          expect(typeof signalKValue.source).toBe('object');
        }
      }
    }

    console.log(
      `Vessel state contains ${Object.keys(vesselState.data).length} data paths`,
    );
  });

  test('should return consistent dynamic paths and maintain data integrity over time', async () => {
    // Wait for more data to accumulate
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);

    // Get initial vessel state
    const vesselState1 = client.getVesselState();

    // Wait a bit and get second snapshot
    await testUtils.waitFor(2000);
    const vesselState2 = client.getVesselState();

    // Get available paths for comparison
    const availablePaths = await client.listAvailablePaths();

    // Data consistency validation
    expect(vesselState1.data).toBeDefined();
    expect(vesselState2.data).toBeDefined();

    const paths1 = Object.keys(vesselState1.data);
    const paths2 = Object.keys(vesselState2.data);

    // Second call should have same or more paths (data only grows)
    expect(paths2.length).toBeGreaterThanOrEqual(paths1.length);

    // All paths from first call should still exist in second call
    for (const path of paths1) {
      expect(paths2).toContain(path);
    }

    // All vessel state paths should be subset of available paths
    if (availablePaths.paths.length > 0) {
      for (const path of paths2) {
        expect(availablePaths.paths).toContain(path);
      }
    }

    // Validate context filtering - no other vessel data should appear
    for (const path of paths2) {
      // Path should not contain references to other vessels
      expect(path).not.toMatch(/^vessels\./);
      expect(path).not.toContain('vessels.');
    }

    // Data integrity validation
    for (const [, signalKValue] of Object.entries(vesselState2.data)) {
      // Value should not be undefined (null is acceptable)
      expect(signalKValue.value).toBeDefined();

      // Timestamp should be reasonable (allow for clock skew)
      const valueAge = Date.now() - new Date(signalKValue.timestamp).getTime();
      expect(valueAge).toBeGreaterThanOrEqual(-300000); // Allow 5 minutes clock skew
      expect(valueAge).toBeLessThan(86400000); // Not older than 24 hours (some data updates infrequently)
    }

    // Timestamps should progress forward
    const timestamp1 = new Date(vesselState1.timestamp);
    const timestamp2 = new Date(vesselState2.timestamp);
    expect(timestamp2.getTime()).toBeGreaterThanOrEqual(timestamp1.getTime());

    // Data should be JSON serializable (AI-ready)
    expect(() => JSON.stringify(vesselState2)).not.toThrow();

    // Serialized data should be reasonable size (not too large for AI)
    const serialized = JSON.stringify(vesselState2);
    expect(serialized.length).toBeLessThan(1000000); // < 1MB

    console.log(
      `Dynamic paths: ${paths1.length} → ${paths2.length} (${paths2.length - paths1.length} added)`,
    );
    console.log(`Available paths on server: ${availablePaths.paths.length}`);
    console.log(
      `Data coverage: ${((paths2.length / Math.max(availablePaths.paths.length, 1)) * 100).toFixed(1)}%`,
    );
  }, 25000); // 25 second timeout for data collection
});
