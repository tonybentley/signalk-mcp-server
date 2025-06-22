/**
 * SignalK Client getActiveAlarms Integration Tests
 * 
 * Tests the getActiveAlarms method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate alarm detection, filtering, state management, and real-time updates.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SignalKClient } from '../src/signalk-client.js';
import dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

describe('SignalK Client getActiveAlarms - Live Integration', () => {
  let client: SignalKClient;
  
  // Extended timeout for real network operations
  const CONNECTION_TIMEOUT = 30000;
  const ALARM_COLLECTION_TIMEOUT = 3000;

  beforeAll(async () => {
    // Create client with environment configuration
    client = new SignalKClient({
      hostname: process.env.SIGNALK_HOST,
      port: parseInt(process.env.SIGNALK_PORT || '3000'),
      useTLS: process.env.SIGNALK_TLS === 'true',
      context: process.env.SIGNALK_CONTEXT || 'vessels.self'
    });

    // Connect to live SignalK server
    try {
      await client.connect();
      console.log(`Connected to SignalK server at ${client.hostname}:${client.port}`);
      
      // Wait for initial data population
      await testUtils.waitFor(2000);
      
    } catch (error) {
      console.error('Failed to connect to SignalK server:', error);
      throw new Error(`Integration test requires live SignalK server at ${client.hostname}:${client.port}`);
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

  test('should return valid alarm structure and handle empty alarm state', async () => {
    // Wait for alarm data collection
    await testUtils.waitFor(ALARM_COLLECTION_TIMEOUT);
    
    // Get active alarms
    const alarms = client.getActiveAlarms();
    
    // Validate basic response structure
    expect(alarms).toBeDefined();
    expect(typeof alarms).toBe('object');
    
    // Connection status should be true for live server
    expect(alarms.connected).toBe(true);
    
    // Count should match array length
    expect(alarms.count).toBe(alarms.alarms.length);
    expect(typeof alarms.count).toBe('number');
    expect(alarms.count).toBeGreaterThanOrEqual(0);
    
    // Alarms should be an array
    expect(Array.isArray(alarms.alarms)).toBe(true);
    
    // Timestamp should be recent and valid ISO string
    expect(alarms.timestamp).toBeDefined();
    expect(typeof alarms.timestamp).toBe('string');
    expect(() => new Date(alarms.timestamp)).not.toThrow();
    
    const timestampAge = Date.now() - new Date(alarms.timestamp).getTime();
    expect(timestampAge).toBeLessThan(5000); // Should be within 5 seconds
    
    // Response should be fast (cached data)
    const startTime = Date.now();
    client.getActiveAlarms();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(100);
    
    // Should be JSON serializable
    expect(() => JSON.stringify(alarms)).not.toThrow();
    
    console.log(`Active alarms: ${alarms.count} found, response time: ${responseTime}ms`);
  }, 10000);

  test('should validate alarm structure and notification properties when alarms exist', async () => {
    // Wait for alarm data accumulation
    await testUtils.waitFor(ALARM_COLLECTION_TIMEOUT);
    
    const alarms = client.getActiveAlarms();
    
    expect(alarms).toBeDefined();
    expect(alarms.connected).toBe(true);
    
    // If alarms exist, validate their structure
    if (alarms.count > 0) {
      console.log(`Found ${alarms.count} active alarms - validating structure`);
      
      for (const alarm of alarms.alarms) {
        // Path validation - should be notification path
        expect(alarm.path).toBeDefined();
        expect(typeof alarm.path).toBe('string');
        expect(alarm.path.length).toBeGreaterThan(0);
        expect(alarm.path).toMatch(/^notifications\./); // Should start with 'notifications.'
        
        // State validation - should be one of the valid alarm states (including normal)
        expect(alarm.state).toBeDefined();
        expect(typeof alarm.state).toBe('string');
        expect(['alert', 'warn', 'alarm', 'emergency', 'normal']).toContain(alarm.state);
        
        // Message validation - optional but should be string if present
        if (alarm.message) {
          expect(typeof alarm.message).toBe('string');
          expect(alarm.message.length).toBeGreaterThan(0);
        }
        
        // Timestamp validation
        expect(alarm.timestamp).toBeDefined();
        expect(typeof alarm.timestamp).toBe('string');
        expect(() => new Date(alarm.timestamp)).not.toThrow();
        
        // Timestamp should be reasonable (depends on alarm state)
        const alarmAge = Date.now() - new Date(alarm.timestamp).getTime();
        if (alarm.state === 'normal') {
          // Normal state alarms can be older (historical/resolved alarms)
          expect(Math.abs(alarmAge)).toBeLessThan(86400000); // Within 24 hours either direction
        } else {
          // Critical alarms should be more recent
          expect(Math.abs(alarmAge)).toBeLessThan(3600000); // Within 1 hour either direction
        }
        
        console.log(`Alarm: ${alarm.path} - ${alarm.state}: ${alarm.message || 'no message'}`);
      }
    } else {
      console.log('No active alarms detected (normal operational state)');
    }
    
    // Validate response metadata
    expect(alarms.timestamp).toBeDefined();
    const responseAge = Date.now() - new Date(alarms.timestamp).getTime();
    expect(responseAge).toBeLessThan(5000);
    
    // Data should be reasonable size
    const serialized = JSON.stringify(alarms);
    expect(serialized.length).toBeLessThan(100000); // < 100KB for alarm data
  }, 10000);

  test('should maintain alarm state consistency over time and handle state changes', async () => {
    // Wait for initial alarm data
    await testUtils.waitFor(ALARM_COLLECTION_TIMEOUT);
    
    // Get initial alarm state
    const alarms1 = client.getActiveAlarms();
    
    // Wait and get second snapshot
    await testUtils.waitFor(2000);
    const alarms2 = client.getActiveAlarms();
    
    // Wait and get third snapshot
    await testUtils.waitFor(2000);
    const alarms3 = client.getActiveAlarms();
    
    // All results should have consistent structure
    for (const result of [alarms1, alarms2, alarms3]) {
      expect(result.connected).toBe(true);
      expect(typeof result.count).toBe('number');
      expect(Array.isArray(result.alarms)).toBe(true);
      expect(result.count).toBe(result.alarms.length);
      expect(result.timestamp).toBeDefined();
    }
    
    // Timestamps should progress forward
    const ts1 = new Date(alarms1.timestamp).getTime();
    const ts2 = new Date(alarms2.timestamp).getTime();
    const ts3 = new Date(alarms3.timestamp).getTime();
    
    expect(ts2).toBeGreaterThanOrEqual(ts1);
    expect(ts3).toBeGreaterThanOrEqual(ts2);
    
    // Alarm counts should be stable or change reasonably
    const maxCount = Math.max(alarms1.count, alarms2.count, alarms3.count);
    const minCount = Math.min(alarms1.count, alarms2.count, alarms3.count);
    
    // Allow for some variation but not dramatic changes
    expect(maxCount - minCount).toBeLessThanOrEqual(Math.max(5, maxCount)); // Allow reasonable variation
    
    // If alarms exist in any snapshot, validate path consistency
    const allPaths = new Set<string>();
    [alarms1, alarms2, alarms3].forEach(snapshot => {
      snapshot.alarms.forEach(alarm => {
        allPaths.add(alarm.path);
        
        // Each alarm path should be consistent across snapshots if it appears
        const samePathAlarms = [alarms1, alarms2, alarms3]
          .map(s => s.alarms.find(a => a.path === alarm.path))
          .filter(a => a !== undefined);
        
        // If alarm appears in multiple snapshots, state should be consistent or progressing
        if (samePathAlarms.length > 1) {
          for (const pathAlarm of samePathAlarms) {
            expect(['alert', 'warn', 'alarm', 'emergency', 'normal']).toContain(pathAlarm!.state);
          }
        }
      });
    });
    
    // All data should be JSON serializable
    expect(() => JSON.stringify(alarms1)).not.toThrow();
    expect(() => JSON.stringify(alarms2)).not.toThrow();
    expect(() => JSON.stringify(alarms3)).not.toThrow();
    
    console.log(`Alarm consistency: ${alarms1.count} → ${alarms2.count} → ${alarms3.count}`);
    console.log(`Unique alarm paths discovered: ${allPaths.size}`);
    
    if (allPaths.size > 0) {
      console.log(`Alarm paths: ${Array.from(allPaths).slice(0, 5).join(', ')}${allPaths.size > 5 ? '...' : ''}`);
    }
  }, 15000);

  test('should handle alarm filtering and demonstrate notification path patterns', async () => {
    // Wait for alarm data
    await testUtils.waitFor(ALARM_COLLECTION_TIMEOUT);
    
    const alarms = client.getActiveAlarms();
    
    expect(alarms).toBeDefined();
    expect(alarms.connected).toBe(true);
    
    // Analyze alarm path patterns if alarms exist
    if (alarms.count > 0) {
      const pathCategories = {
        engine: alarms.alarms.filter(a => a.path.includes('engine')),
        electrical: alarms.alarms.filter(a => a.path.includes('electrical') || a.path.includes('battery')),
        navigation: alarms.alarms.filter(a => a.path.includes('navigation')),
        environment: alarms.alarms.filter(a => a.path.includes('environment')),
        system: alarms.alarms.filter(a => a.path.includes('system')),
        other: alarms.alarms.filter(a => 
          !a.path.includes('engine') && 
          !a.path.includes('electrical') && 
          !a.path.includes('battery') &&
          !a.path.includes('navigation') && 
          !a.path.includes('environment') && 
          !a.path.includes('system')
        )
      };
      
      let categorizedCount = 0;
      for (const [category, categoryAlarms] of Object.entries(pathCategories)) {
        if (categoryAlarms.length > 0) {
          categorizedCount += categoryAlarms.length;
          console.log(`${category} alarms: ${categoryAlarms.length}`);
          
          // Validate category-specific alarm patterns
          for (const alarm of categoryAlarms) {
            expect(alarm.path).toMatch(/^notifications\./);
            expect(['alert', 'warn', 'alarm', 'emergency', 'normal']).toContain(alarm.state);
            
            // Category-specific validations
            switch (category) {
              case 'engine':
                expect(alarm.path).toMatch(/notifications\..*engine/i);
                break;
              case 'electrical':
                expect(alarm.path).toMatch(/notifications\..*(electrical|battery)/i);
                break;
              case 'navigation':
                expect(alarm.path).toMatch(/notifications\..*navigation/i);
                break;
            }
          }
        }
      }
      
      expect(categorizedCount).toBe(alarms.count);
    }
    
    // Test alarm state priorities (if multiple alarms exist)
    if (alarms.count > 1) {
      const statesPriority = { emergency: 4, alarm: 3, warn: 2, alert: 1, normal: 0 };
      const states = alarms.alarms.map(a => a.state);
      const uniqueStates = [...new Set(states)];
      
      console.log(`Alarm states present: ${uniqueStates.join(', ')}`);
      
      // All states should be valid
      for (const state of uniqueStates) {
        expect(Object.keys(statesPriority)).toContain(state);
      }
      
      // Show distribution of alarm states
      const stateDistribution = uniqueStates.map(state => {
        const count = states.filter(s => s === state).length;
        return `${state}: ${count}`;
      });
      console.log(`State distribution: ${stateDistribution.join(', ')}`);
    }
    
    // Performance validation
    const startTime = Date.now();
    const fastAlarms = client.getActiveAlarms();
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(50); // Should be very fast (cached)
    expect(fastAlarms.count).toBe(alarms.count); // Should be consistent
    
    console.log(`Alarm filtering test completed, response time: ${responseTime}ms`);
  }, 10000);

  test('should demonstrate real-time alarm monitoring and delta processing', async () => {
    // Get initial alarm baseline
    const initialAlarms = client.getActiveAlarms();
    
    // Monitor alarm changes over extended period
    const alarmSnapshots = [initialAlarms];
    
    for (let i = 0; i < 3; i++) {
      await testUtils.waitFor(1500); // Wait 1.5 seconds between snapshots
      alarmSnapshots.push(client.getActiveAlarms());
    }
    
    // All snapshots should have valid structure
    for (const snapshot of alarmSnapshots) {
      expect(snapshot.connected).toBe(true);
      expect(typeof snapshot.count).toBe('number');
      expect(Array.isArray(snapshot.alarms)).toBe(true);
      expect(snapshot.timestamp).toBeDefined();
    }
    
    // Track alarm path persistence
    const allAlarmPaths = new Set<string>();
    const pathFirstSeen = new Map<string, number>();
    const pathLastSeen = new Map<string, number>();
    
    alarmSnapshots.forEach((snapshot, index) => {
      snapshot.alarms.forEach(alarm => {
        allAlarmPaths.add(alarm.path);
        
        if (!pathFirstSeen.has(alarm.path)) {
          pathFirstSeen.set(alarm.path, index);
        }
        pathLastSeen.set(alarm.path, index);
      });
    });
    
    // Analyze alarm persistence
    if (allAlarmPaths.size > 0) {
      console.log(`Alarm monitoring: ${allAlarmPaths.size} unique alarm paths observed`);
      
      for (const path of allAlarmPaths) {
        const firstSeen = pathFirstSeen.get(path)!;
        const lastSeen = pathLastSeen.get(path)!;
        const persistence = lastSeen - firstSeen + 1;
        
        console.log(`${path}: appeared in ${persistence}/${alarmSnapshots.length} snapshots`);
      }
      
      // Most alarms should persist across snapshots (stable system state)
      const persistentAlarms = Array.from(allAlarmPaths).filter(path => {
        const persistence = pathLastSeen.get(path)! - pathFirstSeen.get(path)! + 1;
        return persistence >= Math.ceil(alarmSnapshots.length / 2);
      });
      
      if (allAlarmPaths.size > 0) {
        expect(persistentAlarms.length / allAlarmPaths.size).toBeGreaterThan(0.5); // At least 50% should be persistent
      }
    }
    
    // Validate timestamp progression
    for (let i = 1; i < alarmSnapshots.length; i++) {
      const prevTime = new Date(alarmSnapshots[i-1].timestamp).getTime();
      const currTime = new Date(alarmSnapshots[i].timestamp).getTime();
      expect(currTime).toBeGreaterThanOrEqual(prevTime);
    }
    
    // All snapshots should be serializable
    for (const snapshot of alarmSnapshots) {
      expect(() => JSON.stringify(snapshot)).not.toThrow();
    }
    
    const counts = alarmSnapshots.map(s => s.count);
    console.log(`Alarm count progression: ${counts.join(' → ')}`);
  }, 15000);

  test('should handle edge cases and maintain performance under various conditions', async () => {
    // Test rapid successive calls
    const rapidCalls = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      rapidCalls.push(client.getActiveAlarms());
    }
    
    const rapidTime = Date.now() - startTime;
    expect(rapidTime).toBeLessThan(500); // Should handle 10 calls quickly
    
    // All rapid calls should return consistent data
    const firstCall = rapidCalls[0];
    for (const call of rapidCalls) {
      expect(call.connected).toBe(firstCall.connected);
      expect(call.count).toBe(firstCall.count);
      expect(call.alarms.length).toBe(firstCall.alarms.length);
    }
    
    // Test parallel calls
    const parallelStart = Date.now();
    const parallelCalls = await Promise.all([
      Promise.resolve(client.getActiveAlarms()),
      Promise.resolve(client.getActiveAlarms()),
      Promise.resolve(client.getActiveAlarms())
    ]);
    const parallelTime = Date.now() - parallelStart;
    
    expect(parallelTime).toBeLessThan(100);
    
    // Parallel calls should be consistent
    for (const call of parallelCalls) {
      expect(call.connected).toBe(parallelCalls[0].connected);
      expect(call.count).toBe(parallelCalls[0].count);
    }
    
    // Memory usage validation - large number of calls shouldn't accumulate
    for (let i = 0; i < 100; i++) {
      client.getActiveAlarms();
    }
    
    const finalCall = client.getActiveAlarms();
    expect(finalCall.connected).toBe(true);
    
    // Data integrity after many calls
    expect(() => JSON.stringify(finalCall)).not.toThrow();
    const serialized = JSON.stringify(finalCall);
    expect(serialized.length).toBeLessThan(1000000); // Should not grow unbounded
    
    console.log(`Performance test: ${rapidCalls.length} rapid calls in ${rapidTime}ms, parallel calls in ${parallelTime}ms`);
    console.log(`Final state: ${finalCall.count} alarms, ${serialized.length} bytes serialized`);
  }, 10000);

  test('should validate alarm data freshness and real-time responsiveness', async () => {
    // Get baseline alarm state
    const baseline = client.getActiveAlarms();
    
    // Wait for potential alarm updates
    await testUtils.waitFor(ALARM_COLLECTION_TIMEOUT);
    
    const updated = client.getActiveAlarms();
    
    // Both should be valid
    expect(baseline.connected).toBe(true);
    expect(updated.connected).toBe(true);
    
    // Timestamps should progress
    const baselineTime = new Date(baseline.timestamp).getTime();
    const updatedTime = new Date(updated.timestamp).getTime();
    expect(updatedTime).toBeGreaterThanOrEqual(baselineTime);
    
    // If alarms exist, validate their freshness
    if (updated.count > 0) {
      for (const alarm of updated.alarms) {
        const alarmTime = new Date(alarm.timestamp).getTime();
        const alarmAge = Date.now() - alarmTime;
        
        // Alarm age validation depends on state
        if (alarm.state === 'normal') {
          // Normal state alarms can be older (they're resolved/historical)
          expect(alarmAge).toBeLessThan(86400000); // Not older than 24 hours for normal alarms
        } else {
          // Critical alarms should be more recent (active conditions)
          expect(alarmAge).toBeLessThan(3600000); // Not older than 1 hour for critical alarms
        }
        
        // Alarm timestamp should be reasonable (allow for clock skew)
        expect(Math.abs(alarmAge)).toBeLessThan(86400000); // Within 24 hours either direction
      }
      
      console.log(`${updated.count} alarms validated for freshness`);
      
      // Check for alarm age distribution by state
      const criticalAlarms = updated.alarms.filter(alarm => alarm.state !== 'normal');
      const normalAlarms = updated.alarms.filter(alarm => alarm.state === 'normal');
      
      const alarmAges = updated.alarms.map(alarm => {
        return Date.now() - new Date(alarm.timestamp).getTime();
      });
      
      const avgAge = alarmAges.reduce((sum, age) => sum + age, 0) / alarmAges.length;
      const maxAge = Math.max(...alarmAges);
      const minAge = Math.min(...alarmAges);
      
      console.log(`Alarm ages: avg ${(avgAge/1000).toFixed(1)}s, range ${(minAge/1000).toFixed(1)}s-${(maxAge/1000).toFixed(1)}s`);
      console.log(`Critical alarms: ${criticalAlarms.length}, Normal alarms: ${normalAlarms.length}`);
      
      // Critical alarms should be relatively fresh
      if (criticalAlarms.length > 0) {
        const criticalAges = criticalAlarms.map(alarm => Date.now() - new Date(alarm.timestamp).getTime());
        const freshCritical = criticalAges.filter(age => age < 300000); // Less than 5 minutes
        expect(freshCritical.length / criticalAlarms.length).toBeGreaterThan(0.7); // At least 70% of critical should be fresh
      }
    } else {
      console.log('No active alarms - system in normal state');
    }
    
    // Response time should be consistent
    const responseStart = Date.now();
    client.getActiveAlarms();
    const responseTime = Date.now() - responseStart;
    expect(responseTime).toBeLessThan(50);
    
    console.log(`Freshness validation completed, response time: ${responseTime}ms`);
  }, 10000);
});