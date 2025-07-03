/**
 * SignalK Client AIS Targets Integration Tests
 *
 * Tests the getAISTargets method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate AIS target detection, filtering, and data structure.
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

describe('SignalK Client getAISTargets - Live Integration', () => {
  let client: SignalKClient;

  // Extended timeout for real network operations
  const CONNECTION_TIMEOUT = 30000;
  const AIS_COLLECTION_TIMEOUT = 15000;

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

  test('should detect and filter AIS targets with live vessel traffic data', async () => {
    // Wait for AIS data to accumulate from nearby vessels
    // AIS targets broadcast every 2-10 seconds depending on vessel speed/status
    await testUtils.waitFor(AIS_COLLECTION_TIMEOUT);

    // Get initial AIS targets
    const aisTargets1 = await client.getAISTargets();

    // Wait for potential updates and get second snapshot
    await testUtils.waitFor(5000);
    const aisTargets2 = await client.getAISTargets();

    // Validate basic response structure
    expect(aisTargets1).toBeDefined();
    expect(typeof aisTargets1).toBe('object');
    expect(aisTargets2).toBeDefined();
    expect(typeof aisTargets2).toBe('object');

    // Connection status should be true
    expect(aisTargets1.connected).toBe(true);
    expect(aisTargets2.connected).toBe(true);

    // Count should match array length
    expect(aisTargets1.count).toBe(aisTargets1.targets.length);
    expect(aisTargets2.count).toBe(aisTargets2.targets.length);

    // Target limit enforcement (max 50 targets)
    expect(aisTargets1.count).toBeLessThanOrEqual(50);
    expect(aisTargets2.count).toBeLessThanOrEqual(50);

    // Timestamps should be recent and valid
    expect(aisTargets1.timestamp).toBeDefined();
    expect(aisTargets2.timestamp).toBeDefined();
    expect(() => new Date(aisTargets1.timestamp)).not.toThrow();
    expect(() => new Date(aisTargets2.timestamp)).not.toThrow();

    const timestamp1 = new Date(aisTargets1.timestamp);
    const timestamp2 = new Date(aisTargets2.timestamp);
    expect(timestamp2.getTime()).toBeGreaterThanOrEqual(timestamp1.getTime());

    // Target data persistence (targets should remain between calls unless aged out)
    expect(aisTargets2.count).toBeGreaterThanOrEqual(aisTargets1.count - 1); // Allow for 1 target to age out

    // If targets exist, validate their structure and data
    if (aisTargets2.count > 0) {
      console.log(`Found ${aisTargets2.count} AIS targets`);

      for (const target of aisTargets2.targets) {
        // MMSI validation
        expect(target.mmsi).toBeDefined();
        expect(typeof target.mmsi).toBe('string');
        expect(target.mmsi.length).toBeGreaterThan(0);

        // MMSI should not match own vessel context
        const ownVesselId = client.context.replace('vessels.', '');
        expect(target.mmsi).not.toBe(ownVesselId);
        expect(target.mmsi).not.toBe('self');

        // Last update timestamp validation
        expect(target.lastUpdate).toBeDefined();
        expect(typeof target.lastUpdate).toBe('string');
        expect(() => new Date(target.lastUpdate)).not.toThrow();

        // Validate timestamp is a valid date (getAISTargets already filters by age)
        const targetTimestamp = new Date(target.lastUpdate).getTime();
        expect(targetTimestamp).toBeGreaterThan(0); // Valid timestamp
        expect(isNaN(targetTimestamp)).toBe(false); // Not NaN

        // Validate any vessel data if present (pattern-based filtering check)
        for (const [key, value] of Object.entries(target)) {
          if (key !== 'mmsi' && key !== 'lastUpdate' && key !== 'distanceMeters' && key !== 'name') {
            // Should be vessel data paths - validate they match our include patterns
            expect(typeof key).toBe('string');
            expect(key.length).toBeGreaterThan(0);

            // Key should match one of our include patterns
            const isAllowedPath = 
              key.startsWith('navigation.') ||
              key.startsWith('design.') ||
              key.startsWith('communication.') ||
              key.startsWith('registrations.') ||
              key.startsWith('destination.');
            
            expect(isAllowedPath).toBe(true);

            // These paths should NOT be present (filtered out)
            expect(key.startsWith('electrical.')).toBe(false);
            expect(key.startsWith('tanks.')).toBe(false);
            expect(key.startsWith('propulsion.')).toBe(false);
            expect(key.startsWith('environment.')).toBe(false);
            expect(key.startsWith('sensors.')).toBe(false);
            expect(key.startsWith('performance.')).toBe(false);

            // Value should be defined (can be null but not undefined)
            expect(value).toBeDefined();
          }
        }
      }

      // Validate specific target data if position data exists
      const targetsWithPosition = aisTargets2.targets.filter(
        (t) => t['navigation.position'],
      );
      if (targetsWithPosition.length > 0) {
        console.log(`${targetsWithPosition.length} targets have position data`);

        for (const target of targetsWithPosition) {
          const position = target['navigation.position'];
          expect(position).toBeDefined();
          expect(typeof position).toBe('object');

          if (typeof position === 'object' && position !== null) {
            // Position should have latitude/longitude if it's a coordinate object
            if ('latitude' in position && 'longitude' in position) {
              expect(typeof position.latitude).toBe('number');
              expect(typeof position.longitude).toBe('number');
              expect(position.latitude).toBeGreaterThanOrEqual(-90);
              expect(position.latitude).toBeLessThanOrEqual(90);
              expect(position.longitude).toBeGreaterThanOrEqual(-180);
              expect(position.longitude).toBeLessThanOrEqual(180);
            }
          }
        }
      }
    } else {
      console.log('No AIS targets detected (no nearby vessels)');
    }

    // Data should be JSON serializable (AI-ready)
    expect(() => JSON.stringify(aisTargets2)).not.toThrow();

    // Response should be reasonable size
    const serialized = JSON.stringify(aisTargets2);
    expect(serialized.length).toBeLessThan(500000); // < 500KB for AIS data

    // Performance test - should be reasonable (HTTP request)
    const startTime = Date.now();
    await client.getAISTargets();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(5000); // Allow up to 5s for HTTP request

    console.log(`AIS targets: ${aisTargets1.count} → ${aisTargets2.count}`);
    console.log(`Response time: ${responseTime}ms`);

    if (aisTargets2.count > 0) {
      const avgAge =
        aisTargets2.targets.reduce((sum, target) => {
          return sum + (Date.now() - new Date(target.lastUpdate).getTime());
        }, 0) / aisTargets2.targets.length;
      console.log(`Average target age: ${(avgAge / 1000).toFixed(1)}s`);
    }
  }, 30000); // 30 second timeout for AIS data collection

  test('should support pagination for AIS targets', async () => {
    // Test pagination functionality
    const allTargets = await client.getAISTargets();
    const page1 = await client.getAISTargets(1, 5);
    const page2 = await client.getAISTargets(2, 5);

    // Validate pagination metadata
    expect(allTargets.pagination).toBeDefined();
    expect(allTargets.pagination?.page).toBe(1);
    expect(allTargets.pagination?.pageSize).toBe(10);
    
    expect(page1.pagination).toBeDefined();
    expect(page1.pagination?.page).toBe(1);
    expect(page1.pagination?.pageSize).toBe(5);
    expect(page1.count).toBeLessThanOrEqual(5);
    
    if (allTargets.count > 5) {
      expect(page1.pagination?.hasNextPage).toBe(true);
      expect(page2.pagination?.hasPreviousPage).toBe(true);
    }
    
    console.log(
      `Pagination test: ${allTargets.count} total targets, page 1: ${page1.count}, page 2: ${page2.count}`,
    );
  });

  test('should include distance calculations when vessel position available', async () => {
    // Get vessel state first to check if we have position
    const vesselState = await client.getVesselState();
    const hasPosition = vesselState.data['navigation.position']?.value?.latitude !== undefined;
    
    const aisTargets = await client.getAISTargets();
    
    if (hasPosition && aisTargets.count > 0) {
      // Check targets with positions have distance
      const targetsWithPosition = aisTargets.targets.filter(
        target => target['navigation.position']?.value?.latitude !== undefined
      );
      
      targetsWithPosition.forEach(target => {
        expect(target.distanceMeters).toBeDefined();
        expect(typeof target.distanceMeters).toBe('number');
        expect(target.distanceMeters).toBeGreaterThanOrEqual(0);
      });
      
      // Verify sorting by distance (closest first)
      for (let i = 1; i < targetsWithPosition.length; i++) {
        if (targetsWithPosition[i-1].distanceMeters !== undefined && 
            targetsWithPosition[i].distanceMeters !== undefined) {
          expect(targetsWithPosition[i-1].distanceMeters)
            .toBeLessThanOrEqual(targetsWithPosition[i].distanceMeters!);
        }
      }
      
      console.log(
        `Distance test: ${targetsWithPosition.length} targets with distance calculations`,
      );
    } else {
      console.log(
        `Distance test skipped: hasPosition=${hasPosition}, targetCount=${aisTargets.count}`,
      );
    }
  });

  test('should handle empty AIS response gracefully', async () => {
    // This test verifies the method works even when no AIS targets are available
    const aisTargets = await client.getAISTargets();

    // Basic structure validation
    expect(aisTargets).toBeDefined();
    expect(typeof aisTargets).toBe('object');
    expect(aisTargets.connected).toBe(true);
    expect(aisTargets.count).toBeDefined();
    expect(aisTargets.targets).toBeDefined();
    expect(Array.isArray(aisTargets.targets)).toBe(true);
    expect(aisTargets.timestamp).toBeDefined();
    expect(aisTargets.pagination).toBeDefined();

    // Count should match array length
    expect(aisTargets.count).toBe(aisTargets.targets.length);

    // Should be JSON serializable
    expect(() => JSON.stringify(aisTargets)).not.toThrow();

    // Performance should be reasonable even with no data
    const startTime = Date.now();
    await client.getAISTargets();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(5000); // Allow up to 5s for HTTP request

    console.log(
      `Empty AIS response test: ${aisTargets.count} targets, ${responseTime}ms response time`,
    );
  });

  test('should filter AIS data to include only navigation-relevant paths', async () => {
    // Get AIS targets
    const aisTargets = await client.getAISTargets();
    
    if (aisTargets.count > 0) {
      console.log(`Testing pattern-based filtering on ${aisTargets.count} targets`);
      
      // Track which path types we found
      const foundPaths = new Set<string>();
      
      for (const target of aisTargets.targets) {
        // Core fields should always be present
        expect(target.mmsi).toBeDefined();
        expect(target.lastUpdate).toBeDefined();
        
        // Check all paths in the target
        for (const key of Object.keys(target)) {
          if (key !== 'mmsi' && key !== 'lastUpdate' && key !== 'distanceMeters' && key !== 'name') {
            // Extract the path prefix
            const pathPrefix = key.split('.')[0];
            foundPaths.add(pathPrefix);
            
            // Verify this is an allowed path type
            const allowedPrefixes = ['navigation', 'design', 'communication', 'registrations', 'destination'];
            expect(allowedPrefixes).toContain(pathPrefix);
          }
        }
      }
      
      console.log(`Found path prefixes: ${Array.from(foundPaths).join(', ')}`);
      
      // Log sample target structure for debugging
      const sampleTarget = aisTargets.targets[0];
      const sampleKeys = Object.keys(sampleTarget).sort();
      console.log(`Sample target keys: ${sampleKeys.join(', ')}`);
      
      // Verify data is compact (no internal systems data)
      const serializedTarget = JSON.stringify(sampleTarget);
      expect(serializedTarget.length).toBeLessThan(5000); // Each target should be < 5KB
      
      // Ensure no internal vessel systems data is present
      const serializedAll = JSON.stringify(aisTargets);
      expect(serializedAll).not.toContain('electrical.');
      expect(serializedAll).not.toContain('tanks.');
      expect(serializedAll).not.toContain('propulsion.');
      expect(serializedAll).not.toContain('sensors.');
      expect(serializedAll).not.toContain('performance.');
    } else {
      console.log('No AIS targets available for filtering test');
    }
  });
});
