/**
 * SignalKClient Unit Tests
 *
 * Tests the core SignalK client functionality including:
 * - Configuration parsing
 * - URL building
 * - Delta message processing
 * - Data retrieval methods
 */

import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { SignalKClient } from './signalk-client';
import type { SignalKClientOptions } from './types/index.js';

// Mock the @signalk/client module
jest.mock('@signalk/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
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

    // Get the mock constructor using dynamic import
    mockSignalKClient = {
      on: jest.fn(),
      once: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const ClientModule = jest.requireMock('@signalk/client');
    ClientModule.Client.mockImplementation(() => mockSignalKClient);
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
        port: 7000,
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
        useTLS: false,
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
        useTLS: true,
      });

      expect(client.buildWebSocketUrl()).toBe('wss://secure.example.com');
      expect(client.buildHttpUrl()).toBe('https://secure.example.com');
    });

    test('should omit port for standard ports', () => {
      client = new SignalKClient({
        hostname: 'example.com',
        port: 80,
        useTLS: false,
      });

      expect(client.buildWebSocketUrl()).toBe('ws://example.com');
      expect(client.buildHttpUrl()).toBe('http://example.com');
    });

    test('should build REST API URLs correctly', () => {
      const url = client.buildRestApiUrl('self', 'navigation.position');

      expect(url).toBe(
        'http://example.com:3000/signalk/v1/api/vessels/self/navigation/position',
      );
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
        {
          latitude: 37.8199,
          longitude: -122.4783,
        },
      );

      client.handleDelta(delta);

      expect(client.availablePaths.has('navigation.position')).toBe(true);
      expect(client.latestValues.has('vessels.self.navigation.position')).toBe(
        true,
      );

      const storedValue = client.latestValues.get(
        'vessels.self.navigation.position',
      );
      expect(storedValue?.value).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });
    });

    test('should process AIS target data', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.urn:mrn:imo:mmsi:123456789',
        'navigation.position',
        { latitude: 37.8299, longitude: -122.4683 },
      );

      client.handleDelta(delta);

      expect(client.aisTargets.has('urn:mrn:imo:mmsi:123456789')).toBe(true);

      const target = client.aisTargets.get('urn:mrn:imo:mmsi:123456789');
      expect(target?.mmsi).toBe('123456789'); // Now stores just the MMSI number
      expect(target?.['navigation.position']).toEqual({
        latitude: 37.8299,
        longitude: -122.4683,
      });
    });

    test('should process alarm notifications', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        {
          state: 'alert',
          message: 'Engine temperature high',
          timestamp: '2025-06-21T10:00:00.000Z',
        },
      );

      client.handleDelta(delta);

      expect(
        client.activeAlarms.has('notifications.engine.overTemperature'),
      ).toBe(true);

      const alarm = client.activeAlarms.get(
        'notifications.engine.overTemperature',
      );
      expect(alarm?.state).toBe('alert');
      expect(alarm?.message).toBe('Engine temperature high');
    });

    test('should keep alarms when state becomes normal (for audit trail)', () => {
      // First set an alarm
      const alertDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        { state: 'alert', message: 'Engine temperature high' },
      );
      client.handleDelta(alertDelta);

      expect(
        client.activeAlarms.has('notifications.engine.overTemperature'),
      ).toBe(true);
      const alertAlarm = client.activeAlarms.get(
        'notifications.engine.overTemperature',
      );
      expect(alertAlarm?.state).toBe('alert');

      // Then set to normal state
      const normalDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.engine.overTemperature',
        { state: 'normal', message: 'Engine temperature normal' },
      );
      client.handleDelta(normalDelta);

      // Alarm should still exist but with normal state
      expect(
        client.activeAlarms.has('notifications.engine.overTemperature'),
      ).toBe(true);
      const normalAlarm = client.activeAlarms.get(
        'notifications.engine.overTemperature',
      );
      expect(normalAlarm?.state).toBe('normal');
      expect(normalAlarm?.message).toBe('Engine temperature normal');
    });

    test('should delete alarms only when value is null/undefined', () => {
      // First set an alarm
      const alertDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.test.alarm',
        { state: 'alert', message: 'Test alarm' },
      );
      client.handleDelta(alertDelta);

      expect(client.activeAlarms.has('notifications.test.alarm')).toBe(true);

      // Delete the alarm by setting value to null
      const deleteDelta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: new Date().toISOString(),
            source: { label: 'Test', type: 'test' },
            values: [
              {
                path: 'notifications.test.alarm',
                value: null,
              },
            ],
          },
        ],
      };
      client.handleDelta(deleteDelta);

      // Alarm should be deleted
      expect(client.activeAlarms.has('notifications.test.alarm')).toBe(false);
    });
  });

  describe('Data Retrieval Methods', () => {
    beforeEach(() => {
      client = new SignalKClient();

      // Add some test data
      client.latestValues.set('vessels.self.navigation.position', {
        value: { latitude: 37.8199, longitude: -122.4783 },
        timestamp: '2025-06-21T10:00:00.000Z',
        source: { label: 'GPS1', type: 'NMEA0183' },
      });

      client.availablePaths.add('navigation.position');
      client.availablePaths.add('navigation.speedOverGround');

      client.aisTargets.set('123456789', {
        mmsi: '123456789',
        lastUpdate: new Date().toISOString(),
      });

      client.activeAlarms.set('notifications.test', {
        path: 'notifications.test',
        state: 'alert',
        message: 'Test alarm',
      });
    });

    test('should return vessel state correctly', () => {
      const state = client.getVesselState();

      expect(state.connected).toBe(false);
      expect(state.context).toBe('vessels.self');
      expect(state.data['navigation.position']).toBeDefined();
      expect(state.data['navigation.position'].value).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });
    });

    test('should return vessel state dynamically based on available paths', () => {
      // Add additional paths to test dynamic behavior
      client.latestValues.set('vessels.self.navigation.speedOverGround', {
        value: 5.2,
        timestamp: '2025-06-21T10:00:00.000Z',
        source: { label: 'GPS1', type: 'NMEA0183' },
      });

      client.latestValues.set('vessels.self.environment.wind.speedApparent', {
        value: 10.5,
        timestamp: '2025-06-21T10:00:00.000Z',
        source: { label: 'Wind1', type: 'NMEA0183' },
      });

      const state = client.getVesselState();

      // Should include all available paths for the vessel context
      expect(state.data['navigation.position']).toBeDefined();
      expect(state.data['navigation.speedOverGround']).toBeDefined();
      expect(state.data['environment.wind.speedApparent']).toBeDefined();

      // Should not include paths from other vessel contexts
      client.latestValues.set('vessels.other.navigation.position', {
        value: { latitude: 1, longitude: 1 },
        timestamp: '2025-06-21T10:00:00.000Z',
      });

      const stateAfter = client.getVesselState();
      expect(
        stateAfter.data['vessels.other.navigation.position'],
      ).toBeUndefined();
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
        lastUpdate: oldTimestamp,
      });

      // Add a recent target
      client.aisTargets.set('123456789', {
        mmsi: '123456789',
        lastUpdate: new Date().toISOString(),
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
        'navigation.position': {
          value: { latitude: 37.8199, longitude: -122.4783 },
        },
        'navigation.speedOverGround': { value: 5.2 },
        environment: {
          outside: {
            temperature: { value: 298.15 },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
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
        $source: 'sensor1',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await client.getPathValue(
        'environment.outside.temperature',
      );

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
        timestamp: '2025-06-21T10:00:00.000Z',
      });

      mockFetch.mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await client.getPathValue('navigation.position');

      expect(result.error).toContain('HTTP fetch failed');
      expect(result.data.value).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });
    });
  });

  describe('Connection Management', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should resolve immediately if already connected', async () => {
      client.connected = true;

      const result = await client.connect();

      expect(result).toBeUndefined();
      expect(mockSignalKClient.connect).not.toHaveBeenCalled();
    });

    test('should handle connection timeout', async () => {
      jest.useFakeTimers();

      // Mock the connection to never resolve
      mockSignalKClient.connect.mockImplementation(() => new Promise(() => {}));

      const connectPromise = client.connect();

      // Fast-forward past timeout
      jest.advanceTimersByTime(10000);

      await expect(connectPromise).rejects.toThrow('Connection timeout');

      jest.useRealTimers();
    });

    test('should handle connection errors', async () => {
      const error = new Error('Connection failed');

      // Mock the connection to trigger error event
      mockSignalKClient.connect.mockImplementation(() => {
        // Simulate error event being triggered
        const errorHandler = mockSignalKClient.once.mock.calls.find(
          (call: any) => call[0] === 'error',
        )?.[1];
        if (errorHandler) {
          setTimeout(() => errorHandler(error), 0);
        }
      });

      await expect(client.connect()).rejects.toThrow('Connection failed');
    });

    test('should disconnect properly', () => {
      client.connected = true;

      client.disconnect();

      expect(mockSignalKClient.disconnect).toHaveBeenCalled();
      expect(client.connected).toBe(false);
    });
  });

  describe('Event Handling', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should handle connect event', () => {
      const connectHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];

      expect(connectHandler).toBeDefined();

      connectHandler();

      expect(client.connected).toBe(true);
    });

    test('should handle disconnect event', () => {
      client.connected = true;

      const disconnectHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'disconnect',
      )?.[1];

      expect(disconnectHandler).toBeDefined();

      disconnectHandler();

      expect(client.connected).toBe(false);
    });

    test('should handle delta events', () => {
      const deltaHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'delta',
      )?.[1];
      const handleDeltaSpy = jest.spyOn(client, 'handleDelta');

      expect(deltaHandler).toBeDefined();

      const testDelta = global.testUtils.createSampleDelta(
        'vessels.self',
        'navigation.position',
        {
          latitude: 1,
          longitude: 2,
        },
      );
      deltaHandler(testDelta);

      expect(handleDeltaSpy).toHaveBeenCalledWith(testDelta);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should handle delta with missing updates', () => {
      const invalidDelta = {
        context: 'vessels.self',
        // Missing updates array
      };

      expect(() => client.handleDelta(invalidDelta as any)).not.toThrow();
    });

    test('should handle delta with empty values array', () => {
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: '2025-06-21T10:00:00.000Z',
            source: { label: 'TEST', type: 'test' },
            values: [],
          },
        ],
      };

      expect(() => client.handleDelta(delta)).not.toThrow();
    });

    test('should handle delta with null/undefined values', () => {
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: '2025-06-21T10:00:00.000Z',
            source: { label: 'TEST', type: 'test' },
            values: [
              {
                path: 'test.path',
                value: null,
              },
            ],
          },
        ],
      };

      client.handleDelta(delta);

      expect(client.latestValues.has('vessels.self.test.path')).toBe(true);
      expect(client.latestValues.get('vessels.self.test.path')?.value).toBe(
        null,
      );
    });

    test('should handle notifications with missing timestamp', () => {
      const delta = global.testUtils.createSampleDelta(
        'vessels.self',
        'notifications.test.alarm',
        {
          state: 'alert',
          message: 'Test alarm',
          // Missing timestamp
        },
      );

      client.handleDelta(delta);

      expect(client.activeAlarms.has('notifications.test.alarm')).toBe(true);
      const alarm = client.activeAlarms.get('notifications.test.alarm');
      expect(alarm?.timestamp).toBeDefined(); // Should use delta timestamp
    });

    test('should filter out non-MMSI vessel contexts', () => {
      const delta = {
        context: 'vessels.unknown.context',
        updates: [
          {
            timestamp: '2025-06-21T10:00:00.000Z',
            source: { label: 'AIS', type: 'NMEA0183' },
            values: [
              {
                path: 'navigation.position',
                value: { latitude: 37.8199, longitude: -122.4783 },
              },
            ],
          },
        ],
      };

      client.handleDelta(delta);

      // Should NOT create AIS target for non-MMSI vessel context
      expect(client.aisTargets.has('unknown.context')).toBe(false);
    });

    test('should handle getPathValue with empty path', async () => {
      const result = await client.getPathValue('');

      expect(result.path).toBe('');
      expect(result.data).toBe(null);
      expect(result.error).toContain('HTTP fetch failed');
    });

    test('should handle getPathValue with undefined path', async () => {
      const result = await client.getPathValue(undefined as any);

      expect(result.path).toBe(undefined);
      expect(result.data).toBe(null);
      expect(result.error).toContain('HTTP fetch failed');
    });

    test('should handle configuration with invalid port', () => {
      const clientWithInvalidPort = new SignalKClient({
        port: 'invalid' as any,
      });

      expect(clientWithInvalidPort.port).toBe(3000); // Should fallback to default
    });

    test('should handle old AIS targets cleanup', () => {
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 minutes ago

      client.aisTargets.set('old.target', {
        mmsi: 'old.target',
        lastUpdate: oldTimestamp,
        'navigation.position': { latitude: 1, longitude: 1 },
      });

      const recentTimestamp = new Date().toISOString();
      client.aisTargets.set('recent.target', {
        mmsi: 'recent.target',
        lastUpdate: recentTimestamp,
        'navigation.position': { latitude: 2, longitude: 2 },
      });

      const result = client.getAISTargets();

      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].mmsi).toBe('recent.target');
    });

    test('should handle malformed notification values', () => {
      const delta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: '2025-06-21T10:00:00.000Z',
            source: { label: 'TEST', type: 'test' },
            values: [
              {
                path: 'notifications.test.alarm',
                value: 'invalid notification format', // Should be object
              },
            ],
          },
        ],
      };

      expect(() => client.handleDelta(delta)).not.toThrow();

      // Should not create an alarm for invalid format
      expect(client.activeAlarms.has('notifications.test.alarm')).toBe(false);
    });

    test('should handle HTTP response that is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const result = await client.getPathValue('navigation.position');

      expect(result.error).toContain('HTTP fetch failed');
      expect(result.data).toBe(null);
    });

    test('should handle non-JSON HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockImplementation(() => {
          throw new Error('Invalid JSON');
        }),
      } as unknown as Response);

      const result = await client.listAvailablePaths();

      expect(result.error).toContain('HTTP fetch failed');
    });
  });

  describe('Data Formatting and Validation', () => {
    beforeEach(() => {
      client = new SignalKClient();
    });

    test('should format vessel state with empty data correctly', () => {
      const result = client.getVesselState();

      expect(result.connected).toBe(false);
      expect(result.context).toBe('vessels.self');
      expect(result.data).toEqual({});
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
    });

    test('should format AIS targets with empty data correctly', () => {
      const result = client.getAISTargets();

      expect(result.connected).toBe(false);
      expect(result.count).toBe(0);
      expect(result.targets).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });

    test('should format active alarms with empty data correctly', () => {
      const result = client.getActiveAlarms();

      expect(result.connected).toBe(false);
      expect(result.count).toBe(0);
      expect(result.alarms).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });

    test('should format connection status correctly', () => {
      const result = client.getConnectionStatus();

      expect(result.connected).toBe(false);
      expect(result.hostname).toBe('localhost');
      expect(result.port).toBe(3000);
      expect(result.useTLS).toBe(false);
      expect(result.context).toBe('vessels.self');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.pathCount).toBe('number');
      expect(typeof result.aisTargetCount).toBe('number');
      expect(typeof result.activeAlarmCount).toBe('number');
    });
  });

  describe('Initial State Fetching', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
      (client as any).client = mockSignalKClient;
    });

    test('should fetch initial vessel state on connect with HTTP success', async () => {
      // Mock successful HTTP response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          navigation: {
            position: {
              value: { latitude: 37.8199, longitude: -122.4783 },
              timestamp: '2023-06-22T10:30:15.000Z',
            },
            speedOverGround: {
              value: 5.2,
              timestamp: '2023-06-22T10:30:15.100Z',
            },
          },
          environment: {
            wind: {
              speedApparent: {
                value: 8.5,
                timestamp: '2023-06-22T10:30:15.200Z',
              },
            },
          },
        }),
      } as Response);

      // Set up connect event to trigger initial fetch
      let connectHandler: Function | undefined;
      mockSignalKClient.once.mockImplementation(
        (event: string, handler: Function) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        },
      );

      // Start connection
      const connectPromise = client.connect();

      // Trigger connect event
      if (connectHandler) {
        if (connectHandler) {
          await connectHandler();
        }
      }
      await connectPromise;

      // Verify data was populated
      expect(client.latestValues.has('vessels.self.navigation.position')).toBe(
        true,
      );
      expect(
        client.latestValues.has('vessels.self.navigation.speedOverGround'),
      ).toBe(true);
      expect(
        client.latestValues.has('vessels.self.environment.wind.speedApparent'),
      ).toBe(true);

      const position = client.latestValues.get(
        'vessels.self.navigation.position',
      );
      expect(position?.value).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });

      expect(client.availablePaths.has('navigation.position')).toBe(true);
      expect(client.availablePaths.has('navigation.speedOverGround')).toBe(
        true,
      );
      expect(client.availablePaths.has('environment.wind.speedApparent')).toBe(
        true,
      );
    });

    test('should handle HTTP fetch failure during initial state fetch', async () => {
      // Mock HTTP failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Mock console.error to verify error logging
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Set up connect event to trigger initial fetch
      let connectHandler: Function | undefined;
      mockSignalKClient.once.mockImplementation(
        (event: string, handler: Function) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        },
      );

      // Start connection
      const connectPromise = client.connect();

      // Trigger connect event
      if (connectHandler) {
        await connectHandler();
      }
      await connectPromise;

      // Verify error was logged but connection still succeeded (both messages)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch initial vessel state via HTTP:',
        'Network error',
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch initial vessel state:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    test('should handle HTTP response that is not ok during initial fetch', async () => {
      // Mock HTTP failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      // Mock console.error to verify error logging
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Set up connect event to trigger initial fetch
      let connectHandler: Function | undefined;
      mockSignalKClient.once.mockImplementation(
        (event: string, handler: Function) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        },
      );

      // Start connection
      const connectPromise = client.connect();

      // Trigger connect event
      if (connectHandler) {
        await connectHandler();
      }
      await connectPromise;

      // Verify error was logged (both messages)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch initial vessel state via HTTP:',
        'HTTP 404: Not Found',
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch initial vessel state:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    test('should handle complex nested data structures in initial fetch', async () => {
      // Mock complex nested response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          electrical: {
            batteries: {
              house: {
                voltage: {
                  value: 12.6,
                  timestamp: '2023-06-22T10:30:15.000Z',
                  source: { label: 'Battery Monitor', type: 'NMEA2000' },
                },
                current: {
                  value: -5.2,
                  timestamp: '2023-06-22T10:30:15.100Z',
                },
              },
            },
          },
          propulsion: {
            main: {
              temperature: {
                value: 356.15,
                timestamp: '2023-06-22T10:30:15.200Z',
              },
            },
          },
          $schema: 'should-be-ignored',
          meta: { ignore: true },
          timestamp: 'should-be-ignored',
        }),
      } as Response);

      // Set up connect event
      let connectHandler: Function | undefined;
      mockSignalKClient.once.mockImplementation(
        (event: string, handler: Function) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        },
      );

      // Start connection
      const connectPromise = client.connect();
      if (connectHandler) {
        await connectHandler();
      }
      await connectPromise;

      // Verify nested paths were processed correctly
      expect(
        client.latestValues.has(
          'vessels.self.electrical.batteries.house.voltage',
        ),
      ).toBe(true);
      expect(
        client.latestValues.has(
          'vessels.self.electrical.batteries.house.current',
        ),
      ).toBe(true);
      expect(
        client.latestValues.has('vessels.self.propulsion.main.temperature'),
      ).toBe(true);

      // Verify metadata was ignored
      expect(client.latestValues.has('vessels.self.$schema')).toBe(false);
      expect(client.latestValues.has('vessels.self.meta')).toBe(false);
      expect(client.latestValues.has('vessels.self.timestamp')).toBe(false);

      // Verify source information was preserved
      const voltage = client.latestValues.get(
        'vessels.self.electrical.batteries.house.voltage',
      );
      expect(voltage?.source?.label).toBe('Battery Monitor');
      expect(voltage?.source?.type).toBe('NMEA2000');
    });

    test('should handle null and undefined data during populate', async () => {
      // Mock response with null/undefined values
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          navigation: {
            position: null,
            heading: undefined,
            speedOverGround: {
              value: 5.2,
              timestamp: '2023-06-22T10:30:15.000Z',
            },
          },
        }),
      } as Response);

      // Set up connect event
      let connectHandler: Function | undefined;
      mockSignalKClient.once.mockImplementation(
        (event: string, handler: Function) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        },
      );

      // Start connection
      const connectPromise = client.connect();
      if (connectHandler) {
        await connectHandler();
      }
      await connectPromise;

      // Should only have processed valid value
      expect(
        client.latestValues.has('vessels.self.navigation.speedOverGround'),
      ).toBe(true);
      expect(client.latestValues.has('vessels.self.navigation.position')).toBe(
        false,
      );
      expect(client.latestValues.has('vessels.self.navigation.heading')).toBe(
        false,
      );
    });
  });

  describe('Console Output and Event Handling', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
      (client as any).client = mockSignalKClient;
    });

    test('should log connect event to console.error', () => {
      // Mock console.error to capture output
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Get the connect handler
      const connectHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];

      // Trigger connect event
      connectHandler();

      // Verify console output
      expect(consoleSpy).toHaveBeenCalledWith('SignalK client connected');
      expect(client.connected).toBe(true);

      consoleSpy.mockRestore();
    });

    test('should log disconnect event to console.error', () => {
      // Mock console.error to capture output
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Set initial connected state
      client.connected = true;

      // Get the disconnect handler
      const disconnectHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'disconnect',
      )?.[1];

      // Trigger disconnect event
      disconnectHandler();

      // Verify console output
      expect(consoleSpy).toHaveBeenCalledWith('SignalK client disconnected');
      expect(client.connected).toBe(false);

      consoleSpy.mockRestore();
    });

    test('should log error events to console.error', () => {
      // Mock console.error to capture output
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock emit to prevent unhandled error
      const emitSpy = jest.spyOn(client, 'emit').mockImplementation(() => true);

      // Get the error handler
      const errorHandler = mockSignalKClient.on.mock.calls.find(
        (call: any) => call[0] === 'error',
      )?.[1];

      const testError = new Error('Test error');

      // Trigger error event
      errorHandler(testError);

      // Verify console output
      expect(consoleSpy).toHaveBeenCalledWith(
        'SignalK client error:',
        testError,
      );
      expect(emitSpy).toHaveBeenCalledWith('error', testError);

      consoleSpy.mockRestore();
      emitSpy.mockRestore();
    });
  });

  describe('AIS Target Edge Cases', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
    });

    test('should handle AIS target update with existing target', () => {
      // Create initial AIS target
      const vesselContext = 'vessels.urn:mrn:imo:mmsi:123456789';
      const mmsi = '123456789';
      const vesselId = 'urn:mrn:imo:mmsi:123456789';

      // Add initial target
      client.aisTargets.set(vesselId, {
        mmsi: mmsi,
        lastUpdate: '2023-06-22T10:30:00.000Z',
      });

      // Update with new navigation data
      client.updateAISTarget(
        vesselContext,
        'navigation.position',
        { latitude: 37.8199, longitude: -122.4783 },
        '2023-06-22T10:30:15.000Z',
      );

      // Verify target was updated (covers line 336)
      const target = client.aisTargets.get(vesselId);
      expect(target).toBeDefined();
      expect(target?.['navigation.position']).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });
      expect(target?.lastUpdate).toBe('2023-06-22T10:30:15.000Z');
    });

    test('should handle vessel state with undefined/invalid paths', () => {
      // Add some invalid paths to test filtering
      client.latestValues.set('vessels.self.undefined', {
        value: 'test',
        timestamp: '2023-06-22T10:30:15.000Z',
      });

      client.latestValues.set('vessels.self.', {
        value: 'empty',
        timestamp: '2023-06-22T10:30:15.000Z',
      });

      client.latestValues.set('vessels.self.valid.path', {
        value: 'good',
        timestamp: '2023-06-22T10:30:15.000Z',
      });

      const state = client.getVesselState();

      // Should only include valid paths
      expect(state.data['undefined']).toBeUndefined();
      expect(state.data['']).toBeUndefined();
      expect(state.data['valid.path']).toBeDefined();
      expect(state.data['valid.path'].value).toBe('good');
    });
  });

  describe('HTTP Error Handling Coverage', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
    });

    test('should handle JSON parsing error in getPathValue', async () => {
      // Mock response with invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as unknown as Response);

      // Mock console.error to verify error logging
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await client.getPathValue('navigation.position');

      // Verify error handling (covers line 705, 715)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch path navigation.position via HTTP:',
        'Invalid JSON',
      );
      expect(result.error).toContain('HTTP fetch failed: Invalid JSON');
      expect(result.data).toBeNull();

      consoleSpy.mockRestore();
    });

    test('should handle network error in getPathValue', async () => {
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      // Mock console.error to verify error logging
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await client.getPathValue('navigation.position');

      // Verify error handling
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch path navigation.position via HTTP:',
        'Network timeout',
      );
      expect(result.error).toContain('HTTP fetch failed: Network timeout');
      expect(result.data).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  describe('Delta Processing Edge Cases', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
    });

    test('should handle delta processing errors gracefully', () => {
      // Mock console.error to capture error logging
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock emit to throw an error to trigger line 336
      const originalEmit = client.emit;
      client.emit = jest.fn().mockImplementation(() => {
        throw new Error('Emit error');
      }) as any;

      const testDelta = {
        context: 'vessels.self',
        updates: [
          {
            timestamp: '2023-06-22T10:30:15.000Z',
            source: { label: 'Test', type: 'test' },
            values: [
              {
                path: 'navigation.position',
                value: { latitude: 37.8199, longitude: -122.4783 },
              },
            ],
          },
        ],
      };

      // This should not throw an error but should log it
      expect(() => {
        client.handleDelta(testDelta);
      }).not.toThrow();

      // Verify error was logged (covers line 336)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error processing delta:',
        expect.any(Error),
      );

      // Restore original emit
      client.emit = originalEmit;
      consoleSpy.mockRestore();
    });

    test('should handle populateLatestValuesFromData with null/undefined objects', () => {
      // Test early return condition for null/undefined objects (line 276)
      expect(() => {
        // Use private method directly via type assertion
        (client as any).populateLatestValuesFromData(null, 'vessels.self', '');
        (client as any).populateLatestValuesFromData(
          undefined,
          'vessels.self',
          '',
        );
        (client as any).populateLatestValuesFromData(
          'not-object',
          'vessels.self',
          '',
        );
      }).not.toThrow();

      // Verify no data was added
      expect(client.latestValues.size).toBe(0);
      expect(client.availablePaths.size).toBe(0);
    });
  });

  describe('Additional Coverage for Remaining Lines', () => {
    beforeEach(() => {
      client = new SignalKClient({ hostname: 'test.example.com', port: 3000 });
    });

    test('should handle getPathValue with cached data fallback (line 705, 715)', async () => {
      // Add cached data
      client.latestValues.set('vessels.self.navigation.position', {
        value: { latitude: 37.8199, longitude: -122.4783 },
        timestamp: '2023-06-22T10:30:15.000Z',
        source: { label: 'GPS1', type: 'NMEA0183' },
      });

      // Mock HTTP failure
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      // Mock console.error to capture output
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await client.getPathValue('navigation.position');

      // Verify cached data is returned (covers line 715)
      expect(result.data).toBeDefined();
      expect(result.data!.value).toEqual({
        latitude: 37.8199,
        longitude: -122.4783,
      });
      expect(result.error).toContain(
        'HTTP fetch failed: Network failure, using cached value',
      );

      // Verify error was logged (covers line 705)
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch path navigation.position via HTTP:',
        'Network failure',
      );

      consoleSpy.mockRestore();
    });

    test('should cover AIS target assignment edge case (line 336)', () => {
      // Create a scenario where the target exists but the assignment line is tested
      const vesselContext = 'vessels.urn:mrn:imo:mmsi:987654321';
      const vesselId = 'urn:mrn:imo:mmsi:987654321';

      // Initially create target
      client.aisTargets.set(vesselId, {
        mmsi: '987654321',
        lastUpdate: '2023-06-22T10:30:00.000Z',
      });

      // Update with navigation data
      client.updateAISTarget(
        vesselContext,
        'navigation.courseOverGround',
        45.0,
        '2023-06-22T10:30:15.000Z',
      );

      // Verify the target was updated (this exercises line 336)
      const target = client.aisTargets.get(vesselId);
      expect(target).toBeDefined();
      expect(target?.['navigation.courseOverGround']).toBe(45.0);
      expect(target?.lastUpdate).toBe('2023-06-22T10:30:15.000Z');
    });
  });
});
