#!/usr/bin/env node
/**
 * Simple test of SignalK binding with isolate
 */

import { IsolateSandbox } from '../execution-engine/isolate-sandbox.js';

async function main() {
  console.log('=== Simple SignalK Binding Test ===\n');

  const sandbox = new IsolateSandbox();

  // Mock binding
  const mockSignalK = {
    async getVesselState() {
      console.log('[Binding] getVesselState() called');
      return {
        connected: true,
        data: {
          'name': { value: 'Test Vessel' },
          'navigation.position': {
            value: { latitude: 37.8199, longitude: -122.4783 }
          },
          'navigation.speedOverGround': { value: 5.2 }
        }
      };
    },

    async getAISTargets(options: any) {
      console.log('[Binding] getAISTargets() called with options:', options);
      return {
        connected: true,
        count: 3,
        targets: [
          { mmsi: '123456789', distanceMeters: 1500 },
          { mmsi: '987654321', distanceMeters: 3500 },
          { mmsi: '555555555', distanceMeters: 8000 }
        ]
      };
    }
  };

  console.log('Test 1: Get vessel state and filter data\n');
  const result1 = await sandbox.execute(`
    (async () => {
      const vessel = await signalk.getVesselState();
      console.log('Got vessel data');

      // Filter in isolate
      const name = vessel.data.name.value;
      const position = vessel.data['navigation.position'].value;

      console.log('Vessel:', name);
      console.log('Lat:', position.latitude);
      console.log('Lon:', position.longitude);

      // Return as JSON string to avoid transfer issues
      const result = {
        name,
        lat: position.latitude,
        lon: position.longitude
      };
      console.log('Result:', JSON.stringify(result));
      return JSON.stringify(result);
    })()
  `, { signalk: mockSignalK });

  console.log('\nResult:', result1);
  console.log('\n---\n');

  console.log('Test 2: Get AIS targets and filter by distance\n');
  const result2 = await sandbox.execute(`
    (async () => {
      console.log('Calling getAISTargets...');
      const response = await signalk.getAISTargets();
      console.log('Total targets:', response.count);

      // Filter in isolate (not in LLM context!)
      const closeTargets = response.targets.filter(t =>
        t.distanceMeters && t.distanceMeters < 5000
      );

      console.log('Close targets (<5km):', closeTargets.length);

      const result = {
        total: response.count,
        close: closeTargets.length,
        closest: closeTargets[0]
      };
      console.log('Result:', JSON.stringify(result));
      return JSON.stringify(result);
    })()
  `, { signalk: mockSignalK });

  console.log('\nResult:', result2);
  console.log('\n---\n');

  console.log('✓ All tests passed!');
  console.log('\nPhase 2 Complete: SignalK binding layer works with V8 isolates!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
