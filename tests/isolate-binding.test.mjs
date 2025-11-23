/**
 * Isolate Sandbox + SignalK Binding Integration Test
 *
 * This test verifies that object parameters can be passed across the V8 isolate
 * boundary when calling SignalK binding methods. It tests the fix for the
 * "non-transferable value" error.
 *
 * Run with: npm run test:isolate
 * Requires: SIGNALK_HOST environment variable (e.g., SIGNALK_HOST=nmea.local)
 */

import { SignalKClient } from '../dist/src/signalk-client.js';
import { SignalKBinding } from '../dist/src/bindings/signalk-binding.js';
import { IsolateSandbox } from '../dist/src/execution-engine/isolate-sandbox.js';

const host = process.env.SIGNALK_HOST || 'localhost';
const port = parseInt(process.env.SIGNALK_PORT || '3000');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function main() {
  console.log(`\nIsolate Sandbox + SignalK Binding Tests`);
  console.log(`Connecting to SignalK at ${host}:${port}...\n`);

  const client = new SignalKClient({ hostname: host, port });
  await client.connect();

  const binding = new SignalKBinding(client);
  const sandbox = new IsolateSandbox();

  console.log('Object Parameter Passing:');

  await test('should pass object options to getAisTargets', async () => {
    const code = `
      (async () => {
        const result = await signalk.getAisTargets({ page: 1, pageSize: 5 });
        return JSON.stringify({
          success: true,
          count: result.count,
          pageSize: result.pagination?.pageSize
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    assert(typeof result.result === 'string', `Result should be string, got ${typeof result.result}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.success === true, 'parsed.success should be true');
    assert(parsed.pageSize === 5, `pageSize should be 5, got ${parsed.pageSize}`);
  });

  await test('should pass object parameter to getPathValue', async () => {
    const code = `
      (async () => {
        const result = await signalk.getPathValue({ path: 'navigation.position' });
        return JSON.stringify({
          success: true,
          hasData: !!result.data,
          path: result.path
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.path === 'navigation.position', `path should be navigation.position`);
  });

  await test('should pass nested object options to getAisTargets', async () => {
    const code = `
      (async () => {
        const result = await signalk.getAisTargets({
          page: 1,
          pageSize: 10,
          maxDistance: 10000
        });
        return JSON.stringify({
          success: true,
          count: result.count
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.success === true, 'Should succeed');
  });

  console.log('\nAll SDK Methods:');

  await test('should execute getVesselState in isolate', async () => {
    const code = `
      (async () => {
        const result = await signalk.getVesselState();
        return JSON.stringify({
          connected: result.connected,
          hasData: Object.keys(result.data || {}).length > 0
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.connected === true, 'Should be connected');
    assert(parsed.hasData === true, 'Should have data');
  });

  await test('should execute getActiveAlarms in isolate', async () => {
    const code = `
      (async () => {
        const result = await signalk.getActiveAlarms();
        return JSON.stringify({
          connected: result.connected,
          hasAlarms: Array.isArray(result.alarms)
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.connected === true, 'Should be connected');
    assert(parsed.hasAlarms === true, 'Should have alarms array');
  });

  await test('should execute listAvailablePaths in isolate', async () => {
    const code = `
      (async () => {
        const result = await signalk.listAvailablePaths();
        return JSON.stringify({
          count: result.count,
          hasPaths: Array.isArray(result.paths)
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.count > 0, 'Should have paths');
  });

  await test('should execute getConnectionStatus in isolate', async () => {
    const code = `
      (async () => {
        const result = await signalk.getConnectionStatus();
        return JSON.stringify({
          connected: result.connected,
          hostname: result.hostname
        });
      })()
    `;
    const result = await sandbox.execute(code, { signalk: binding });
    assert(result.success, `Execution failed: ${result.error}`);
    const parsed = JSON.parse(result.result);
    assert(parsed.connected === true, 'Should be connected');
  });

  client.disconnect();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test setup failed:', err);
  process.exit(1);
});
