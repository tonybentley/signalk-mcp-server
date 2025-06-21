/**
 * SignalK Paths Discovery End-to-End Tests
 * 
 * Tests SignalK path discovery functionality by injecting sample data
 * and verifying the client can process and retrieve it correctly.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { SignalKClient } from '../src/signalk-client';
import type { SignalKDelta } from '../src/types';

describe('SignalK Paths Discovery E2E Tests', () => {
  let client: SignalKClient;

  beforeAll(() => {
    console.log('🔍 Testing SignalK paths discovery...\n');
    client = new SignalKClient();
  });

  afterAll(() => {
    if (client) {
      client.disconnect();
    }
  });

  const createSampleNavDelta = (): SignalKDelta => ({
    context: 'vessels.self',
    updates: [{
      timestamp: new Date().toISOString(),
      source: { label: 'GPS1', type: 'NMEA0183' },
      values: [
        {
          path: 'navigation.position',
          value: { latitude: 37.8199, longitude: -122.4783 }
        },
        {
          path: 'navigation.speedOverGround',
          value: 5.2
        },
        {
          path: 'navigation.courseOverGroundTrue',
          value: 1.5708
        }
      ]
    }]
  });

  const createSampleWindDelta = (): SignalKDelta => ({
    context: 'vessels.self',
    updates: [{
      timestamp: new Date().toISOString(),
      source: { label: 'WIND1', type: 'NMEA0183' },
      values: [
        {
          path: 'environment.wind.speedApparent',
          value: 8.5
        },
        {
          path: 'environment.wind.angleApparent',
          value: 0.785
        }
      ]
    }]
  });

  const createSampleAISDelta = (): SignalKDelta => ({
    context: 'vessels.urn:mrn:imo:mmsi:123456789',
    updates: [{
      timestamp: new Date().toISOString(),
      source: { label: 'AIS', type: 'NMEA0183' },
      values: [
        {
          path: 'navigation.position',
          value: { latitude: 37.8299, longitude: -122.4683 }
        },
        {
          path: 'navigation.speedOverGround',
          value: 12.3
        }
      ]
    }]
  });

  const createSampleAlarmDelta = (): SignalKDelta => ({
    context: 'vessels.self',
    updates: [{
      timestamp: new Date().toISOString(),
      source: { label: 'ENGINE', type: 'internal' },
      values: [
        {
          path: 'notifications.engine.overTemperature',
          value: {
            state: 'alert',
            message: 'Engine temperature high',
            timestamp: new Date().toISOString()
          }
        }
      ]
    }]
  });

  test('should start with empty state', async () => {
    console.log('📊 Testing initial empty state...');
    
    const initialPaths = await client.listAvailablePaths();
    const initialVesselState = client.getVesselState();
    const initialAISTargets = client.getAISTargets();
    const initialAlarms = client.getActiveAlarms();

    expect(initialPaths.count).toBe(0);
    expect(initialPaths.paths).toEqual([]);
    expect(Object.keys(initialVesselState.data)).toHaveLength(0);
    expect(initialAISTargets.count).toBe(0);
    expect(initialAISTargets.targets).toEqual([]);
    expect(initialAlarms.count).toBe(0);
    expect(initialAlarms.alarms).toEqual([]);
  });

  test('should process navigation delta messages', () => {
    console.log('🧭 Testing navigation delta processing...');
    
    const navDelta = createSampleNavDelta();
    client.handleDelta(navDelta);

    // Check that paths were discovered
    expect(client.availablePaths.has('navigation.position')).toBe(true);
    expect(client.availablePaths.has('navigation.speedOverGround')).toBe(true);
    expect(client.availablePaths.has('navigation.courseOverGroundTrue')).toBe(true);

    // Check that values were stored
    const positionKey = 'vessels.self.navigation.position';
    const speedKey = 'vessels.self.navigation.speedOverGround';
    
    expect(client.latestValues.has(positionKey)).toBe(true);
    expect(client.latestValues.has(speedKey)).toBe(true);

    const positionValue = client.latestValues.get(positionKey);
    const speedValue = client.latestValues.get(speedKey);

    expect(positionValue?.value).toEqual({ latitude: 37.8199, longitude: -122.4783 });
    expect(speedValue?.value).toBe(5.2);
  });

  test('should process environment delta messages', () => {
    console.log('🌬️ Testing environment delta processing...');
    
    const windDelta = createSampleWindDelta();
    client.handleDelta(windDelta);

    // Check wind paths
    expect(client.availablePaths.has('environment.wind.speedApparent')).toBe(true);
    expect(client.availablePaths.has('environment.wind.angleApparent')).toBe(true);

    // Check values
    const windSpeedKey = 'vessels.self.environment.wind.speedApparent';
    const windAngleKey = 'vessels.self.environment.wind.angleApparent';

    expect(client.latestValues.has(windSpeedKey)).toBe(true);
    expect(client.latestValues.has(windAngleKey)).toBe(true);

    const windSpeedValue = client.latestValues.get(windSpeedKey);
    const windAngleValue = client.latestValues.get(windAngleKey);

    expect(windSpeedValue?.value).toBe(8.5);
    expect(windAngleValue?.value).toBe(0.785);
  });

  test('should process AIS target data', () => {
    console.log('🚢 Testing AIS target processing...');
    
    const aisDelta = createSampleAISDelta();
    client.handleDelta(aisDelta);

    // Check AIS target was created
    const targetId = 'urn:mrn:imo:mmsi:123456789';
    expect(client.aisTargets.has(targetId)).toBe(true);

    const target = client.aisTargets.get(targetId);
    expect(target?.mmsi).toBe(targetId);
    expect(target?.['navigation.position']).toEqual({ latitude: 37.8299, longitude: -122.4683 });
    expect(target?.['navigation.speedOverGround']).toBe(12.3);
    expect(target?.lastUpdate).toBeDefined();
  });

  test('should process alarm notifications', () => {
    console.log('🚨 Testing alarm processing...');
    
    const alarmDelta = createSampleAlarmDelta();
    client.handleDelta(alarmDelta);

    // Check alarm was created
    const alarmPath = 'notifications.engine.overTemperature';
    expect(client.activeAlarms.has(alarmPath)).toBe(true);

    const alarm = client.activeAlarms.get(alarmPath);
    expect(alarm?.path).toBe(alarmPath);
    expect(alarm?.state).toBe('alert');
    expect(alarm?.message).toBe('Engine temperature high');
    expect(alarm?.timestamp).toBeDefined();
  });

  test('should return comprehensive vessel state', () => {
    console.log('📋 Testing comprehensive vessel state...');
    
    const vesselState = client.getVesselState();

    expect(vesselState.connected).toBe(false); // Not actually connected in test
    expect(vesselState.context).toBe('vessels.self');
    expect(vesselState.timestamp).toBeDefined();

    // Should have navigation data
    expect(vesselState.data['navigation.position']).toBeDefined();
    expect(vesselState.data['navigation.speedOverGround']).toBeDefined();
    expect(vesselState.data['navigation.courseOverGroundTrue']).toBeDefined();
    
    // Should have wind data
    expect(vesselState.data['environment.wind.speedApparent']).toBeDefined();
    expect(vesselState.data['environment.wind.angleApparent']).toBeDefined();
  });

  test('should return AIS targets with recent filter', () => {
    console.log('🎯 Testing AIS targets filtering...');
    
    const aisTargets = client.getAISTargets();

    expect(aisTargets.connected).toBe(false);
    expect(aisTargets.count).toBeGreaterThanOrEqual(1);
    expect(aisTargets.targets.length).toBe(aisTargets.count);
    expect(aisTargets.timestamp).toBeDefined();

    // Check target structure
    if (aisTargets.targets.length > 0) {
      const target = aisTargets.targets[0];
      expect(target.mmsi).toBe('urn:mrn:imo:mmsi:123456789');
      expect(target.lastUpdate).toBeDefined();
    }
  });

  test('should return active alarms', () => {
    console.log('⚠️ Testing active alarms...');
    
    const activeAlarms = client.getActiveAlarms();

    expect(activeAlarms.connected).toBe(false);
    expect(activeAlarms.count).toBeGreaterThanOrEqual(1);
    expect(activeAlarms.alarms.length).toBe(activeAlarms.count);
    expect(activeAlarms.timestamp).toBeDefined();

    // Check alarm structure
    if (activeAlarms.alarms.length > 0) {
      const alarm = activeAlarms.alarms[0];
      expect(alarm.path).toBe('notifications.engine.overTemperature');
      expect(alarm.state).toBe('alert');
      expect(alarm.message).toBe('Engine temperature high');
    }
  });

  test('should list discovered paths', async () => {
    console.log('📝 Testing path discovery...');
    
    const availablePaths = await client.listAvailablePaths();

    expect(availablePaths.count).toBeGreaterThan(0);
    expect(availablePaths.paths).toBeDefined();
    expect(Array.isArray(availablePaths.paths)).toBe(true);
    expect(availablePaths.timestamp).toBeDefined();

    // Should contain expected paths from injected data
    expect(availablePaths.paths).toContain('navigation.position');
    expect(availablePaths.paths).toContain('navigation.speedOverGround');
    expect(availablePaths.paths).toContain('environment.wind.speedApparent');
    
    // Paths should be sorted
    const sortedPaths = [...availablePaths.paths].sort();
    expect(availablePaths.paths).toEqual(sortedPaths);
  });

  test('should get specific path values', async () => {
    console.log('🔍 Testing specific path value retrieval...');
    
    const positionValue = await client.getPathValue('navigation.position');
    const speedValue = await client.getPathValue('navigation.speedOverGround');

    // Test valid path
    expect(positionValue.path).toBe('navigation.position');
    expect(positionValue.connected).toBe(false);
    expect(positionValue.timestamp).toBeDefined();
    
    if (positionValue.data) {
      expect(positionValue.data.value).toEqual({ latitude: 37.8199, longitude: -122.4783 });
    }

    // Test another valid path
    expect(speedValue.path).toBe('navigation.speedOverGround');
    if (speedValue.data) {
      expect(speedValue.data.value).toBe(5.2);
    }
  });

  test('should handle alarm state changes', () => {
    console.log('🔄 Testing alarm state changes...');
    
    // Clear the alarm by setting state to normal
    const normalAlarmDelta: SignalKDelta = {
      context: 'vessels.self',
      updates: [{
        timestamp: new Date().toISOString(),
        source: { label: 'ENGINE', type: 'internal' },
        values: [{
          path: 'notifications.engine.overTemperature',
          value: {
            state: 'normal',
            message: 'Engine temperature normal',
            timestamp: new Date().toISOString()
          }
        }]
      }]
    };

    client.handleDelta(normalAlarmDelta);

    // Alarm should be removed
    expect(client.activeAlarms.has('notifications.engine.overTemperature')).toBe(false);

    const activeAlarms = client.getActiveAlarms();
    expect(activeAlarms.count).toBe(0);
    expect(activeAlarms.alarms).toEqual([]);
  });

  test('should maintain connection status', () => {
    console.log('🔗 Testing connection status...');
    
    const status = client.getConnectionStatus();

    expect(status.connected).toBe(false); // Not actually connected in test
    expect(status.hostname).toBe('localhost');
    expect(status.port).toBe(3000);
    expect(status.useTLS).toBe(false);
    expect(status.context).toBe('vessels.self');
    expect(status.timestamp).toBeDefined();
    expect(typeof status.pathCount).toBe('number');
    expect(typeof status.aisTargetCount).toBe('number');
    expect(typeof status.activeAlarmCount).toBe('number');
  });
});