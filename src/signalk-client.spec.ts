/**
 * SignalKClient Unit Tests
 * 
 * Tests the core SignalK client functionality including:
 * - Configuration parsing
 * - URL building
 * - Delta message processing
 * - Data retrieval methods
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SignalKClient } from './signalk-client';
import type { SignalKClientOptions } from './types';

// Mock the @signalk/client module
jest.mock('@signalk/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn()
  }))
}));

// Mock fetch for HTTP tests
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('SignalKClient', () => {
  let client: SignalKClient;
  let mockSignalKClient: any;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.SIGNALK_HOST;
    delete process.env.SIGNALK_PORT;
    delete process.env.SIGNALK_TLS;
    delete process.env.SIGNALK_TOKEN;
    delete process.env.SIGNALK_CONTEXT;
    
    // Clear mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
    
    // Get the mock constructor
    const { Client } = require('@signalk/client');
    mockSignalKClient = {
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    };
    Client.mockImplementation(() => mockSignalKClient);
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('Configuration', () => {
    test('should use default configuration when no options provided', () => {
      client = new SignalKClient();
      
      expect(client.hostname).toBe('localhost');
      expect(client.port).toBe(3000);
      expect(client.useTLS).toBe(false);
      expect(client.originalUrl).toBe('ws://localhost:3000');
    });

    test('should use environment variables for configuration', () => {
      process.env.SIGNALK_HOST = 'testhost';
      process.env.SIGNALK_PORT = '8080';
      process.env.SIGNALK_TLS = 'true';
      
      client = new SignalKClient();
      
      expect(client.hostname).toBe('testhost');
      expect(client.port).toBe(8080);
      expect(client.useTLS).toBe(true);
      expect(client.originalUrl).toBe('wss://testhost:8080');
    });

    test('should override environment with options', () => {
      process.env.SIGNALK_HOST = 'envhost';
      process.env.SIGNALK_PORT = '9000';
      
      const options: SignalKClientOptions = {
        hostname: 'optionhost',
        port: 7000
      };
      client = new SignalKClient(options);
      
      expect(client.hostname).toBe('optionhost');
      expect(client.port).toBe(7000);
    });

    test('should handle string port conversion', () => {
      client = new SignalKClient({ port: '4000' });
      
      expect(client.port).toBe(4000);
      expect(typeof client.port).toBe('number');
    });
  });

  describe('URL Building', () => {
    beforeEach(() => {
      client = new SignalKClient({
        hostname: 'example.com',
        port: 3000,
        useTLS: false
      });
    });

    test('should build WebSocket URL correctly', () => {
      expect(client.buildWebSocketUrl()).toBe('ws://example.com:3000');
    });

    test('should build HTTP URL correctly', () => {
      expect(client.buildHttpUrl()).toBe('http://example.com:3000');
    });

    test('should build secure URLs when TLS enabled', () => {
      client = new SignalKClient({
        hostname: 'secure.example.com',
        port: 443,
        useTLS: true
      });
      
      expect(client.buildWebSocketUrl()).toBe('wss://secure.example.com');
      expect(client.buildHttpUrl()).toBe('https://secure.example.com');
    });

    test('should omit port for standard ports', () => {
      client = new SignalKClient({
        hostname: 'example.com',
        port: 80,
        useTLS: false
      });
      
      expect(client.buildWebSocketUrl()).toBe('ws://example.com');
      expect(client.buildHttpUrl()).toBe('http://example.com');
    });

    test('should build REST API URLs correctly', () => {
      const url = client.buildRestApiUrl('self', 'navigation.position');
      
      expect(url).toBe('http://example.com:3000/signalk/v1/api/vessels/self/navigation/position');
    });

    test('should handle empty path in REST API URL', () => {
      const url = client.buildRestApiUrl('self');
      
      expect(url).toBe('http://example.com:3000/signalk/v1/api/vessels/self');
    });
  });

  describe('Delta Message Processing', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should process navigation delta messages', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.self',
        'navigation.position',
        { latitude: 37.8199, longitude: -122.4783 }
      );
      
      client.handleDelta(delta);
      
      expect(client.availablePaths.has('navigation.position')).toBe(true);
      expect(client.latestValues.has('vessels.self.navigation.position')).toBe(true);
      
      const storedValue = client.latestValues.get('vessels.self.navigation.position');
      expect(storedValue?.value).toEqual({ latitude: 37.8199, longitude: -122.4783 });
    });

    test('should process AIS target data', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.urn:mrn:imo:mmsi:123456789',
        'navigation.position',
        { latitude: 37.8299, longitude: -122.4683 }
      );
      
      client.handleDelta(delta);
      
      expect(client.aisTargets.has('urn:mrn:imo:mmsi:123456789')).toBe(true);
      
      const target = client.aisTargets.get('urn:mrn:imo:mmsi:123456789');
      expect(target?.mmsi).toBe('urn:mrn:imo:mmsi:123456789');
      expect(target?.['navigation.position']).toEqual({ latitude: 37.8299, longitude: -122.4683 });
    });

    test('should process alarm notifications', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        {
          state: 'alert',
          message: 'Engine temperature high',
          timestamp: '2025-06-21T10:00:00.000Z'
        }
      );
      
      client.handleDelta(delta);
      
      expect(client.activeAlarms.has('notifications.engine.overTemperature')).toBe(true);
      
      const alarm = client.activeAlarms.get('notifications.engine.overTemperature');
      expect(alarm?.state).toBe('alert');
      expect(alarm?.message).toBe('Engine temperature high');
    });

    test('should clear alarms when state becomes normal', () => {
      // First set an alarm
      const alertDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        { state: 'alert', message: 'Engine temperature high' }
      );
      client.handleDelta(alertDelta);
      
      expect(client.activeAlarms.has('notifications.engine.overTemperature')).toBe(true);
      
      // Then clear it
      const normalDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        { state: 'normal', message: 'Engine temperature normal' }
      );
      client.handleDelta(normalDelta);
      
      expect(client.activeAlarms.has('notifications.engine.overTemperature')).toBe(false);
    });
  });

  describe('Data Retrieval Methods', () => {
    beforeEach(() => {
      client = new SignalKClient();
      
      // Add some test data
      client.latestValues.set('vessels.self.navigation.position', {
        value: { latitude: 37.8199, longitude: -122.4783 },
        timestamp: '2025-06-21T10:00:00.000Z',
        source: { label: 'GPS1', type: 'NMEA0183' }
      });
      
      client.availablePaths.add('navigation.position');
      client.availablePaths.add('navigation.speedOverGround');
      
      client.aisTargets.set('123456789', {
        mmsi: '123456789',
        lastUpdate: new Date().toISOString()
      });
      
      client.activeAlarms.set('notifications.test', {
        path: 'notifications.test',
        state: 'alert',
        message: 'Test alarm'
      });
    });

    test('should return vessel state correctly', () => {
      const state = client.getVesselState();
      
      expect(state.connected).toBe(false);
      expect(state.context).toBe('vessels.self');
      expect(state.data['navigation.position']).toBeDefined();
      expect(state.data['navigation.position'].value).toEqual({ latitude: 37.8199, longitude: -122.4783 });
    });

    test('should return AIS targets correctly', () => {
      const targets = client.getAISTargets();
      
      expect(targets.connected).toBe(false);
      expect(targets.count).toBe(1);
      expect(targets.targets).toHaveLength(1);
      expect(targets.targets[0].mmsi).toBe('123456789');
    });

    test('should filter old AIS targets', () => {
      // Add an old target (> 5 minutes old)
      const oldTimestamp = new Date(Date.now() - 400000).toISOString(); // 6+ minutes ago
      client.aisTargets.set('old-target', {
        mmsi: 'old-target', 
        lastUpdate: oldTimestamp
      });
      
      // Add a recent target
      client.aisTargets.set('123456789', {
        mmsi: '123456789',
        lastUpdate: new Date().toISOString()
      });
      
      const targets = client.getAISTargets();
      
      // Should only return the recent target
      expect(targets.count).toBe(1);
      expect(targets.targets[0].mmsi).toBe('123456789');
    });

    test('should return active alarms correctly', () => {
      const alarms = client.getActiveAlarms();
      
      expect(alarms.connected).toBe(false);
      expect(alarms.count).toBe(1);
      expect(alarms.alarms).toHaveLength(1);
      expect(alarms.alarms[0].path).toBe('notifications.test');
      expect(alarms.alarms[0].state).toBe('alert');
    });

    test('should return connection status correctly', () => {
      client.connected = true;
      
      const status = client.getConnectionStatus();
      
      expect(status.connected).toBe(true);
      expect(status.hostname).toBe('localhost');
      expect(status.port).toBe(3000);
      expect(status.useTLS).toBe(false);
      expect(status.pathCount).toBe(2);
      expect(status.aisTargetCount).toBe(1);
      expect(status.activeAlarmCount).toBe(1);
    });
  });

  describe('HTTP Methods', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should fetch available paths via HTTP successfully', async () => {
      const mockResponse = {
        'navigation.position': { value: { latitude: 37.8199, longitude: -122.4783 } },
        'navigation.speedOverGround': { value: 5.2 },
        'environment': {
          'outside': {
            'temperature': { value: 298.15 }
          }
        }
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);
      
      const result = await client.listAvailablePaths();
      
      expect(result.connected).toBe(false);
      expect(result.count).toBe(3);
      expect(result.paths).toContain('navigation.position');
      expect(result.paths).toContain('navigation.speedOverGround');
      expect(result.paths).toContain('environment.outside.temperature');
    });

    test('should handle HTTP fetch failure for available paths', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await client.listAvailablePaths();
      
      expect(result.error).toContain('HTTP fetch failed');
      expect(result.count).toBe(0); // Falls back to WebSocket-discovered paths
    });

    test('should fetch path value via HTTP successfully', async () => {
      const mockResponse = {
        value: 298.15,
        meta: { units: 'K', description: 'Temperature' },
        timestamp: '2025-06-21T10:00:00.000Z',
        $source: 'sensor1'
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);
      
      const result = await client.getPathValue('environment.outside.temperature');
      
      expect(result.connected).toBe(false);
      expect(result.path).toBe('environment.outside.temperature');
      expect(result.data.value).toBe(298.15);
      expect(result.data.meta.units).toBe('K');
    });

    test('should handle HTTP fetch failure for path value', async () => {
      mockFetch.mockRejectedValueOnce(new Error('404 Not Found'));
      
      const result = await client.getPathValue('navigation.position');
      
      expect(result.error).toContain('HTTP fetch failed');
      expect(result.data).toBeNull(); // No cached data
    });

    test('should use cached data when HTTP fails', async () => {
      // Set up cached data
      client.latestValues.set('vessels.self.navigation.position', {
        value: { latitude: 37.8199, longitude: -122.4783 },
        timestamp: '2025-06-21T10:00:00.000Z'
      });
      
      mockFetch.mockRejectedValueOnce(new Error('404 Not Found'));
      
      const result = await client.getPathValue('navigation.position');
      
      expect(result.error).toContain('HTTP fetch failed');
      expect(result.data.value).toEqual({ latitude: 37.8199, longitude: -122.4783 });
    });
  });
});