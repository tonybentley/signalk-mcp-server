#!/usr/bin/env node
/**
 * Demo script to test IsolateSandbox
 * Run with: node --loader ts-node/esm src/execution-engine/demo.ts
 */

import { IsolateSandbox } from './isolate-sandbox.js';

async function main() {
  console.log('=== IsolateSandbox Demo ===\n');

  const sandbox = new IsolateSandbox();

  // Test 1: Simple arithmetic
  console.log('Test 1: Simple arithmetic');
  const result1 = await sandbox.execute('2 + 2');
  console.log('Result:', result1);
  console.log('');

  // Test 2: Console.log capture
  console.log('Test 2: Console.log capture');
  const result2 = await sandbox.execute(`
    console.log('Hello from isolate!');
    console.log('Number:', 42);
    'done'
  `);
  console.log('Result:', result2);
  console.log('');

  // Test 3: Async/await
  console.log('Test 3: Async/await');
  const result3 = await sandbox.execute(`
    (async () => {
      console.log('Starting async operation...');
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Async operation complete!');
      return 'async result';
    })()
  `);
  console.log('Result:', result3);
  console.log('');

  // Test 4: Error handling
  console.log('Test 4: Error handling');
  const result4 = await sandbox.execute(`
    console.log('Before error');
    throw new Error('Test error');
  `);
  console.log('Result:', result4);
  console.log('');

  // Test 5: Bindings
  console.log('Test 5: Bindings');
  const mathBinding = {
    add: (a: number, b: number) => {
      console.log(`[Binding] Adding ${a} + ${b}`);
      return a + b;
    },
    multiply: (a: number, b: number) => {
      console.log(`[Binding] Multiplying ${a} * ${b}`);
      return a * b;
    },
  };

  const result5 = await sandbox.execute(
    `
    console.log('Calling math.add(5, 7)');
    const sum = math.add(5, 7);
    console.log('Sum:', sum);

    console.log('Calling math.multiply(6, 7)');
    const product = math.multiply(6, 7);
    console.log('Product:', product);

    sum + product
    `,
    { math: mathBinding }
  );
  console.log('Result:', result5);
  console.log('');

  // Test 6: Async bindings
  console.log('Test 6: Async bindings');
  const asyncBinding = {
    fetchData: async () => {
      console.log('[Binding] Fetching data...');
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('[Binding] Data fetched!');
      return { value: 42, name: 'SignalK' };
    },
  };

  const result6 = await sandbox.execute(
    `
    (async () => {
      console.log('Calling api.fetchData()');
      const data = await api.fetchData();
      console.log('Received data:', JSON.stringify(data));
      return data.value;
    })()
    `,
    { api: asyncBinding }
  );
  console.log('Result:', result6);
  console.log('');

  // Test 7: Isolation (no Node.js globals)
  console.log('Test 7: Isolation check');
  const result7 = await sandbox.execute(`
    console.log('typeof process:', typeof process);
    console.log('typeof require:', typeof require);
    console.log('typeof __dirname:', typeof __dirname);

    typeof process === 'undefined' &&
    typeof require === 'undefined' &&
    typeof __dirname === 'undefined'
  `);
  console.log('Result:', result7);
  console.log('');

  console.log('=== All tests complete ===');
}

main().catch(console.error);
