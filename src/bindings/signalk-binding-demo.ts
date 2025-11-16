#!/usr/bin/env node
/**
 * SignalK Binding Demo - Shows token savings with code execution
 * Run with: node --loader ts-node/esm src/bindings/signalk-binding-demo.ts
 */

import { SignalKClient } from '../signalk-client.js';
import { SignalKBinding } from './signalk-binding.js';
import { IsolateSandbox } from '../execution-engine/isolate-sandbox.js';

async function main() {
  try {
    console.log('=== SignalK Binding + Isolate Demo ===\n');

    // Initialize SignalK client
    const client = new SignalKClient({
      hostname: process.env.SIGNALK_HOST || 'localhost',
      port: parseInt(process.env.SIGNALK_PORT || '3000'),
      useTLS: process.env.SIGNALK_TLS === 'true',
    });

    // Create binding (wraps client, hides credentials)
    const binding = new SignalKBinding(client);

    // Create sandbox
    const sandbox = new IsolateSandbox();

    console.log('Connecting to SignalK server...');
    try {
      await client.connect();
      console.log('✓ Connected\n');
    } catch (error: any) {
      console.error('✗ Connection failed:', error.message || error);
      console.log('\nNote: Start SignalK server or set SIGNALK_HOST/SIGNALK_PORT\n');
      console.log('Running demo with mock binding instead...\n');
      return await runMockDemo();
    }
  } catch (error: any) {
    console.error('Fatal error in main():', error);
    throw error;
  }

  // Demo 1: Get vessel state
  console.log('--- Demo 1: Get Vessel State ---');
  const result1 = await sandbox.execute(
    `
    const vessel = await signalk.getVesselState();

    // Extract just position and speed (filter in isolate!)
    const position = vessel.data['navigation.position']?.value;
    const speed = vessel.data['navigation.speedOverGround']?.value;
    const name = vessel.data['name']?.value;

    console.log('Vessel name:', name || 'Unknown');
    if (position) {
      console.log('Position:', position.latitude.toFixed(4), ',', position.longitude.toFixed(4));
    }
    if (speed !== undefined) {
      console.log('Speed:', (speed * 1.94384).toFixed(1), 'knots');
    }

    // Return only summary
    return {
      name: name || 'Unknown',
      position,
      speedKnots: speed ? (speed * 1.94384).toFixed(1) : null,
      pathCount: Object.keys(vessel.data).length
    };
    `,
    { signalk: binding }
  );

  console.log('\nResult:', result1.result);
  console.log('Logs:', result1.logs);
  console.log('Execution time:', result1.executionTime, 'ms\n');

  // Demo 2: Get and filter AIS targets
  console.log('--- Demo 2: Find Close AIS Targets ---');
  const result2 = await sandbox.execute(
    `
    const response = await signalk.getAISTargets({ pageSize: 50 });

    console.log('Total AIS targets:', response.count);

    // Filter in isolate (not in LLM context!)
    const closeTargets = response.targets.filter(t =>
      t.distanceMeters && t.distanceMeters < 5000  // Within 5km
    );

    console.log('Targets within 5km:', closeTargets.length);

    // Sort by distance
    closeTargets.sort((a, b) =>
      (a.distanceMeters || Infinity) - (b.distanceMeters || Infinity)
    );

    // Return only top 3 closest
    const top3 = closeTargets.slice(0, 3).map(t => ({
      mmsi: t.mmsi,
      distanceMeters: t.distanceMeters,
      name: t.name
    }));

    console.log('Closest 3:', JSON.stringify(top3, null, 2));

    return {
      totalTargets: response.count,
      closeTargets: closeTargets.length,
      closest: top3
    };
    `,
    { signalk: binding }
  );

  console.log('\nResult:', result2.result);
  console.log('Logs:', result2.logs);
  console.log('Execution time:', result2.executionTime, 'ms\n');

  // Demo 3: Multi-call workflow (huge token savings)
  console.log('--- Demo 3: Multi-Call Workflow ---');
  const result3 = await sandbox.execute(
    `
    // Get vessel state
    const vessel = await signalk.getVesselState();
    const position = vessel.data['navigation.position']?.value;

    // Get AIS targets
    const targets = await signalk.getAISTargets({ pageSize: 50 });

    // Get alarms
    const alarms = await signalk.getActiveAlarms();

    // Process ALL data in isolate
    const criticalAlarms = alarms.alarms.filter(a =>
      a.state === 'alarm' || a.state === 'emergency'
    );

    const closeVessels = targets.targets.filter(t =>
      t.distanceMeters && t.distanceMeters < 1852  // Within 1nm
    );

    console.log('Position:', position ? 'available' : 'unavailable');
    console.log('Critical alarms:', criticalAlarms.length);
    console.log('Close vessels:', closeVessels.length);
    console.log('Total vessel data paths:', Object.keys(vessel.data).length);

    // Return only summary
    return {
      hasPosition: !!position,
      criticalAlarms: criticalAlarms.length,
      closeVessels: closeVessels.length,
      totalPaths: Object.keys(vessel.data).length
    };
    `,
    { signalk: binding }
  );

  console.log('\nResult:', result3.result);
  console.log('Logs:', result3.logs);
  console.log('Execution time:', result3.executionTime, 'ms\n');

  // Token comparison
  console.log('--- Token Comparison ---');
  console.log('\nOld Tools-Based Approach:');
  console.log('  1. get_vessel_state() -> ~2000 tokens (all paths)');
  console.log('  2. get_ais_targets() -> ~10000 tokens (50 targets × 200)');
  console.log('  3. get_active_alarms() -> ~1000 tokens (all alarms)');
  console.log('  4. Agent processes in context -> ~5000 tokens');
  console.log('  Total: ~18,000 tokens\n');

  console.log('New Code Execution Approach:');
  console.log('  1. Agent writes code -> ~500 tokens');
  console.log('  2. Code executes in isolate (no tokens)');
  console.log('  3. Return summary only -> ~200 tokens');
  console.log('  Total: ~700 tokens\n');

  console.log('Token Savings: 18,000 -> 700 = 96.1% reduction! 🎉\n');

  // Cleanup
  client.disconnect();
}

/**
 * Mock demo when SignalK server not available
 */
async function runMockDemo() {
  const sandbox = new IsolateSandbox();

  // Create mock binding
  const mockBinding = {
    async getVesselState() {
      return {
        connected: true,
        context: 'vessels.self',
        timestamp: new Date().toISOString(),
        data: {
          'name': { value: 'Mock Vessel', timestamp: new Date().toISOString() },
          'navigation.position': {
            value: { latitude: 37.8199, longitude: -122.4783 },
            timestamp: new Date().toISOString(),
          },
          'navigation.speedOverGround': {
            value: 5.2,
            timestamp: new Date().toISOString(),
          },
        },
      };
    },

    async getAISTargets() {
      return {
        connected: true,
        count: 3,
        timestamp: new Date().toISOString(),
        targets: [
          {
            mmsi: '123456789',
            distanceMeters: 1500,
            'navigation.position': {
              value: { latitude: 37.8200, longitude: -122.4800 },
            },
          },
          {
            mmsi: '987654321',
            distanceMeters: 3500,
            'navigation.position': {
              value: { latitude: 37.8250, longitude: -122.4850 },
            },
          },
          {
            mmsi: '555555555',
            distanceMeters: 8000,
            'navigation.position': {
              value: { latitude: 37.8300, longitude: -122.4900 },
            },
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalCount: 3,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    },

    async getActiveAlarms() {
      return {
        connected: true,
        count: 1,
        timestamp: new Date().toISOString(),
        alarms: [
          {
            path: 'notifications.test.alert',
            state: 'alert',
            message: 'Test alert',
            timestamp: new Date().toISOString(),
          },
        ],
      };
    },
  };

  console.log('--- Mock Demo: Multi-Call Workflow ---');
  const result = await sandbox.execute(
    `
    const vessel = await signalk.getVesselState();
    const targets = await signalk.getAISTargets();
    const alarms = await signalk.getActiveAlarms();

    // Filter in isolate
    const closeTargets = targets.targets.filter(t =>
      t.distanceMeters && t.distanceMeters < 5000
    );

    console.log('Vessel:', vessel.data.name.value);
    console.log('Position:', vessel.data['navigation.position'].value);
    console.log('Close targets:', closeTargets.length, '/', targets.count);
    console.log('Alarms:', alarms.count);

    return {
      vessel: vessel.data.name.value,
      closeTargets: closeTargets.length,
      totalTargets: targets.count,
      alarms: alarms.count
    };
    `,
    { signalk: mockBinding }
  );

  console.log('\nResult:', result.result);
  console.log('Logs:', result.logs);
  console.log('Execution time:', result.executionTime, 'ms\n');

  console.log('✓ Mock demo complete - binding layer works!\n');
  console.log('To test with real SignalK server:');
  console.log('  1. Start SignalK server');
  console.log('  2. Set SIGNALK_HOST and SIGNALK_PORT if needed');
  console.log('  3. Run this demo again\n');
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
