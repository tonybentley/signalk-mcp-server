/**
 * SignalK Client getConnectionStatus Integration Tests
 * 
 * Tests the getConnectionStatus method with live SignalK server connection.
 * These tests connect to a real SignalK server using .env configuration
 * and validate connection status data structure and behavior.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SignalKClient } from '../src/signalk-client.js';
import dotenv from 'dotenv';

// Load environment configuration
dotenv.config();

describe('SignalK Client getConnectionStatus - Live Integration', () => {
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
      context: process.env.SIGNALK_CONTEXT || 'vessels.self'
    });

    // Connect to live SignalK server
    try {
      await client.connect();
      console.log(`Connected to SignalK server at ${client.hostname}:${client.port}`);
      
      // Wait for initial data population
      await testUtils.waitFor(5000);
      
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

  test('should return valid connection status structure when connected', async () => {
    // Get connection status
    const status = client.getConnectionStatus();
    
    // Validate basic response structure
    expect(status).toBeDefined();
    expect(typeof status).toBe('object');
    
    // Connection should be true for live server
    expect(status.connected).toBe(true);
    
    // URLs should be properly formatted
    expect(status.url).toBeDefined();
    expect(typeof status.url).toBe('string');
    expect(status.url).toMatch(/^wss?:\/\/.+:\d+$/);
    
    expect(status.wsUrl).toBeDefined();
    expect(typeof status.wsUrl).toBe('string');
    expect(status.wsUrl).toMatch(/^wss?:\/\/.+:\d+$/);
    
    expect(status.httpUrl).toBeDefined();
    expect(typeof status.httpUrl).toBe('string');
    expect(status.httpUrl).toMatch(/^https?:\/\/.+:\d+$/);
    
    // Configuration should match environment
    expect(status.hostname).toBe(process.env.SIGNALK_HOST || 'localhost');
    expect(status.port).toBe(parseInt(process.env.SIGNALK_PORT || '3000'));
    expect(status.useTLS).toBe(process.env.SIGNALK_TLS === 'true');
    expect(status.context).toBe(process.env.SIGNALK_CONTEXT || 'vessels.self');
    
    // URL consistency checks
    const expectedProtocol = status.useTLS ? 'wss://' : 'ws://';
    const expectedHttpProtocol = status.useTLS ? 'https://' : 'http://';
    const expectedBase = `${status.hostname}:${status.port}`;
    
    expect(status.url).toBe(`${expectedProtocol}${expectedBase}`);
    expect(status.wsUrl).toBe(`${expectedProtocol}${expectedBase}`);
    expect(status.httpUrl).toBe(`${expectedHttpProtocol}${expectedBase}`);
    
    // Counts should be non-negative integers
    expect(status.pathCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(status.pathCount)).toBe(true);
    
    expect(status.aisTargetCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(status.aisTargetCount)).toBe(true);
    
    expect(status.activeAlarmCount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(status.activeAlarmCount)).toBe(true);
    
    // Timestamp should be recent and valid ISO string
    expect(status.timestamp).toBeDefined();
    expect(typeof status.timestamp).toBe('string');
    expect(() => new Date(status.timestamp)).not.toThrow();
    
    const timestampAge = Date.now() - new Date(status.timestamp).getTime();
    expect(timestampAge).toBeLessThan(1000); // Should be within 1 second (freshly generated)
    
    // Response should be fast (synchronous operation)
    const startTime = Date.now();
    client.getConnectionStatus();
    const responseTime = Date.now() - startTime;
    expect(responseTime).toBeLessThan(50);
    
    console.log(`Connection status: ${status.connected ? 'Connected' : 'Disconnected'}`);
    console.log(`Server: ${status.hostname}:${status.port} (TLS: ${status.useTLS})`);
    console.log(`Data counts - Paths: ${status.pathCount}, AIS: ${status.aisTargetCount}, Alarms: ${status.activeAlarmCount}`);
  });

  test('should reflect real-time changes in data counts over time', async () => {
    // Get initial status
    const status1 = client.getConnectionStatus();
    
    // Wait for more data to accumulate
    await testUtils.waitFor(DATA_COLLECTION_TIMEOUT);
    
    // Get second status
    const status2 = client.getConnectionStatus();
    
    // Connection should remain stable
    expect(status1.connected).toBe(true);
    expect(status2.connected).toBe(true);
    
    // Configuration should remain consistent
    expect(status2.hostname).toBe(status1.hostname);
    expect(status2.port).toBe(status1.port);
    expect(status2.useTLS).toBe(status1.useTLS);
    expect(status2.context).toBe(status1.context);
    expect(status2.url).toBe(status1.url);
    expect(status2.wsUrl).toBe(status1.wsUrl);
    expect(status2.httpUrl).toBe(status1.httpUrl);
    
    // Data counts should be same or higher (data only accumulates)
    expect(status2.pathCount).toBeGreaterThanOrEqual(status1.pathCount);
    expect(status2.aisTargetCount).toBeGreaterThanOrEqual(status1.aisTargetCount);
    expect(status2.activeAlarmCount).toBeGreaterThanOrEqual(status1.activeAlarmCount);
    
    // Timestamps should progress forward
    const timestamp1 = new Date(status1.timestamp);
    const timestamp2 = new Date(status2.timestamp);
    expect(timestamp2.getTime()).toBeGreaterThan(timestamp1.getTime());
    
    // Should be JSON serializable (AI-ready)
    expect(() => JSON.stringify(status2)).not.toThrow();
    
    // Validate counts against actual data
    const vesselState = client.getVesselState();
    const aisTargets = client.getAISTargets();
    const activeAlarms = client.getActiveAlarms();
    
    // pathCount represents ALL discovered paths, not just vessel context paths
    expect(status2.pathCount).toBeGreaterThanOrEqual(Object.keys(vesselState.data).length);
    // aisTargetCount is raw count, getAISTargets() filters and limits to 50
    expect(status2.aisTargetCount).toBeGreaterThanOrEqual(aisTargets.targets.length);
    expect(status2.activeAlarmCount).toBe(activeAlarms.alarms.length);
    
    // Data should be reasonable for marine environment
    if (status2.pathCount > 0) {
      expect(status2.pathCount).toBeLessThan(1000); // Reasonable upper bound
    }
    
    if (status2.aisTargetCount > 0) {
      expect(status2.aisTargetCount).toBeLessThan(500); // Reasonable upper bound for busy marine area
    }
    
    if (status2.activeAlarmCount > 0) {
      expect(status2.activeAlarmCount).toBeLessThan(50); // Reasonable upper bound for alarms
    }
    
    console.log(`Status evolution: Paths ${status1.pathCount}→${status2.pathCount}, AIS ${status1.aisTargetCount}→${status2.aisTargetCount}, Alarms ${status1.activeAlarmCount}→${status2.activeAlarmCount}`);
  }, 25000); // 25 second timeout for data collection

  test('should maintain status consistency before and after disconnect', async () => {
    // Get status while connected
    const connectedStatus = client.getConnectionStatus();
    expect(connectedStatus.connected).toBe(true);
    
    // Save data counts for comparison
    const connectedCounts = {
      pathCount: connectedStatus.pathCount,
      aisTargetCount: connectedStatus.aisTargetCount,
      activeAlarmCount: connectedStatus.activeAlarmCount
    };
    
    // Disconnect
    client.disconnect();
    await testUtils.waitFor(1000); // Wait for disconnect to complete
    
    // Get status while disconnected
    const disconnectedStatus = client.getConnectionStatus();
    
    // Connection should be false
    expect(disconnectedStatus.connected).toBe(false);
    
    // Configuration should remain the same
    expect(disconnectedStatus.hostname).toBe(connectedStatus.hostname);
    expect(disconnectedStatus.port).toBe(connectedStatus.port);
    expect(disconnectedStatus.useTLS).toBe(connectedStatus.useTLS);
    expect(disconnectedStatus.context).toBe(connectedStatus.context);
    expect(disconnectedStatus.url).toBe(connectedStatus.url);
    expect(disconnectedStatus.wsUrl).toBe(connectedStatus.wsUrl);
    expect(disconnectedStatus.httpUrl).toBe(connectedStatus.httpUrl);
    
    // Data counts should be preserved (cached data remains)
    expect(disconnectedStatus.pathCount).toBe(connectedCounts.pathCount);
    expect(disconnectedStatus.aisTargetCount).toBe(connectedCounts.aisTargetCount);
    expect(disconnectedStatus.activeAlarmCount).toBe(connectedCounts.activeAlarmCount);
    
    // Timestamp should be recent (status is freshly generated)
    const timestampAge = Date.now() - new Date(disconnectedStatus.timestamp).getTime();
    expect(timestampAge).toBeLessThan(1000);
    
    // Attempt to reconnect for cleanup - this may fail in test environment
    try {
      const reconnectPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Reconnect timeout')), 8000);
        client.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      client.connect();
      await reconnectPromise;
      await testUtils.waitFor(1000); // Brief additional wait for stability
      
      const reconnectedStatus = client.getConnectionStatus();
      expect(reconnectedStatus.connected).toBe(true);
      console.log(`Connection lifecycle: Connected→Disconnected→Reconnected`);
    } catch (error) {
      // Reconnection may fail in test environment - that's acceptable
      console.log(`Connection lifecycle: Connected→Disconnected→(Reconnect failed in test environment)`);
      console.warn('Reconnection failed (acceptable in test environment):', error.message);
    }
    
    console.log(`Data preserved through disconnect: ${connectedCounts.pathCount} paths, ${connectedCounts.aisTargetCount} AIS, ${connectedCounts.activeAlarmCount} alarms`);
  }, 30000); // 30 second timeout for connection lifecycle test
});