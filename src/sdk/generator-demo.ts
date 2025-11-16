#!/usr/bin/env node
/**
 * SDK Generator Demo - Shows auto-generation from MCP tools
 * Run with: node --loader ts-node/esm src/sdk/generator-demo.ts
 */

import { generateSDK, prepareSDKForIsolate, type MCPTool } from './generator.js';
import { IsolateSandbox } from '../execution-engine/isolate-sandbox.js';

// Mock MCP tool definitions (from SignalKMCPServer)
const mcpTools: MCPTool[] = [
  {
    name: 'get_vessel_state',
    description: 'Get current vessel navigation data (position, heading, speed, wind, vessel identity)',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_ais_targets',
    description: 'Get nearby AIS targets sorted by distance from self vessel (closest first)',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (1-based, default: 1)',
          minimum: 1,
        },
        pageSize: {
          type: 'number',
          description: 'Number of targets per page (default: 10, max: 50)',
          minimum: 1,
          maximum: 50,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_active_alarms',
    description: 'Get current system notifications and alerts',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_path_value',
    description: 'Get latest value for a specific SignalK path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'SignalK data path (e.g., navigation.position)',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

async function main() {
  console.log('=== SDK Generator Demo ===\n');

  // Step 1: Generate SDK from MCP tools
  console.log('Step 1: Generating SDK from MCP tools...\n');
  const sdkCode = generateSDK(mcpTools);
  console.log('Generated SDK Code:');
  console.log('---');
  console.log(sdkCode);
  console.log('---\n');

  // Step 2: Prepare SDK for isolate injection
  console.log('Step 2: Preparing SDK for isolate injection...\n');
  const { wrapperCode } = prepareSDKForIsolate(mcpTools);

  // Step 3: Test SDK in isolate with mock binding
  console.log('Step 3: Testing SDK in isolate with mock binding...\n');

  const mockSignalK = {
    async getVesselState() {
      console.log('[Binding] getVesselState() called');
      return {
        data: {
          name: { value: 'SDK Test Vessel' },
          'navigation.position': {
            value: { latitude: 37.8199, longitude: -122.4783 },
          },
        },
      };
    },

    async getAisTargets(options: any) {
      console.log('[Binding] getAisTargets() called with:', options);
      return {
        count: 5,
        targets: [
          { mmsi: '111111111', distanceMeters: 500 },
          { mmsi: '222222222', distanceMeters: 1500 },
          { mmsi: '333333333', distanceMeters: 3000 },
        ],
      };
    },

    async getActiveAlarms() {
      console.log('[Binding] getActiveAlarms() called');
      return {
        count: 1,
        alarms: [{ path: 'notifications.test', state: 'alert' }],
      };
    },

    async getPathValue(options: any) {
      console.log('[Binding] getPathValue() called with:', options);
      return {
        path: options,
        data: { value: 'mock value' },
      };
    },
  };

  const sandbox = new IsolateSandbox();

  // Test 1: Use generated SDK functions
  console.log('Test 1: Using generated SDK functions\n');
  const result1 = await sandbox.execute(
    `
    ${wrapperCode}

    (async () => {
      console.log('Calling getVesselState via SDK...');
      const vessel = await getVesselState();
      console.log('Got vessel:', vessel.data.name.value);

      console.log('Calling getAisTargets via SDK...');
      const targets = await getAisTargets({ page: 1, pageSize: 10 });
      console.log('Got', targets.count, 'targets');

      console.log('Calling getActiveAlarms via SDK...');
      const alarms = await getActiveAlarms();
      console.log('Got', alarms.count, 'alarms');

      const result = {
        vessel: vessel.data.name.value,
        targetCount: targets.count,
        alarmCount: alarms.count
      };

      console.log('Result:', JSON.stringify(result));
      return JSON.stringify(result);
    })()
    `,
    { signalk: mockSignalK }
  );

  console.log('\nResult:', result1);
  console.log('\n---\n');

  // Test 2: Show that SDK is cleaner than direct binding calls
  console.log('Test 2: SDK provides cleaner code than direct binding\n');

  console.log('OLD WAY (direct binding):');
  console.log('  const vessel = await signalk.getVesselState();');
  console.log('  const targets = await signalk.getAisTargets(options);');
  console.log('');
  console.log('NEW WAY (generated SDK):');
  console.log('  const vessel = await getVesselState();');
  console.log('  const targets = await getAisTargets({ page: 1, pageSize: 10 });');
  console.log('');
  console.log('Benefits:');
  console.log('  ✓ No need to reference "signalk." prefix');
  console.log('  ✓ Type-safe parameters (TypeScript)');
  console.log('  ✓ JSDoc comments from tool descriptions');
  console.log('  ✓ Automatically stays in sync with MCP tools');
  console.log('\n---\n');

  console.log('✓ SDK Generator works!');
  console.log('\nPhase 3 Complete: SDK auto-generation from MCP tools');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
