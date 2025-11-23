import { describe, it, expect, beforeEach } from '@jest/globals';
import { IsolateSandbox } from './isolate-sandbox.js';

describe.skip('IsolateSandbox', () => {
  let sandbox: IsolateSandbox;

  beforeEach(() => {
    sandbox = new IsolateSandbox();
  });

  describe('Basic Execution', () => {
    it('should execute simple arithmetic', async () => {
      const result = await sandbox.execute('2 + 2');
      expect(result.success).toBe(true);
      expect(result.result).toBe(4);
      expect(result.logs).toEqual([]);
    });

    it('should execute string operations', async () => {
      const result = await sandbox.execute('"hello" + " " + "world"');
      expect(result.success).toBe(true);
      expect(result.result).toBe('hello world');
    });

    it('should handle return statements', async () => {
      const result = await sandbox.execute(`
        const x = 10;
        const y = 20;
        x + y;
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(30);
    });
  });

  describe('Console Output', () => {
    it('should capture console.log output', async () => {
      const result = await sandbox.execute(`
        console.log('Hello from isolate');
        42
      `);
      expect(result.success).toBe(true);
      expect(result.logs).toEqual(['Hello from isolate']);
      expect(result.result).toBe(42);
    });

    it('should capture multiple console.log calls', async () => {
      const result = await sandbox.execute(`
        console.log('Line 1');
        console.log('Line 2');
        console.log('Line 3');
        'done'
      `);
      expect(result.success).toBe(true);
      expect(result.logs).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle console.log with multiple arguments', async () => {
      const result = await sandbox.execute(`
        console.log('Number:', 42, 'String:', 'hello');
        null
      `);
      expect(result.success).toBe(true);
      expect(result.logs).toEqual(['Number: 42 String: hello']);
    });
  });

  describe('Async/Await Support', () => {
    it('should support promises', async () => {
      const result = await sandbox.execute(`
        (async () => {
          const promise = new Promise(resolve => resolve(42));
          return await promise;
        })()
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('should support async functions', async () => {
      const result = await sandbox.execute(`
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'async result';
        })()
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe('async result');
    });
  });

  describe('Error Handling', () => {
    it('should catch syntax errors', async () => {
      const result = await sandbox.execute('const x = ;');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Unexpected token');
    });

    it('should catch runtime errors', async () => {
      const result = await sandbox.execute(`
        const obj = null;
        obj.property;
      `);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should catch reference errors', async () => {
      const result = await sandbox.execute('undefinedVariable');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('undefinedVariable');
    });

    it('should include logs even on error', async () => {
      const result = await sandbox.execute(`
        console.log('Before error');
        throw new Error('Test error');
      `);
      expect(result.success).toBe(false);
      expect(result.logs).toEqual(['Before error']);
      expect(result.error).toContain('Test error');
    });
  });

  describe('Timeout Enforcement', () => {
    it('should timeout infinite loops', async () => {
      const shortTimeout = new IsolateSandbox({ timeoutMs: 100 });
      const result = await shortTimeout.execute(`
        while(true) {
          // Infinite loop
        }
      `);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 10000);

    it('should not timeout quick operations', async () => {
      const result = await sandbox.execute(`
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        sum
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(499500);
    });
  });

  describe('Bindings', () => {
    it('should inject simple binding', async () => {
      const mathBinding = {
        multiply: (a: number, b: number) => a * b,
      };

      const result = await sandbox.execute(
        'math.multiply(6, 7)',
        { math: mathBinding }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('should inject async binding', async () => {
      const asyncBinding = {
        fetchData: async () => {
          return new Promise(resolve => {
            setTimeout(() => resolve({ value: 42 }), 10);
          });
        },
      };

      const result = await sandbox.execute(
        '(async () => { const data = await api.fetchData(); return data.value; })()',
        { api: asyncBinding }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    it('should inject multiple bindings', async () => {
      const binding1 = { getValue: () => 10 };
      const binding2 = { getValue: () => 20 };

      const result = await sandbox.execute(
        'api1.getValue() + api2.getValue()',
        { api1: binding1, api2: binding2 }
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe(30);
    });

    it('should pass object parameters to binding methods', async () => {
      const dataBinding = {
        getData: (options: { page?: number; pageSize?: number }) => {
          return {
            page: options?.page || 1,
            pageSize: options?.pageSize || 10,
            items: ['a', 'b', 'c'],
          };
        },
      };

      const result = await sandbox.execute(
        '(async () => { const data = await api.getData({ page: 2, pageSize: 5 }); return JSON.stringify(data); })()',
        { api: dataBinding }
      );

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.result);
      expect(parsed.page).toBe(2);
      expect(parsed.pageSize).toBe(5);
    });

    it('should pass nested object parameters to binding methods', async () => {
      const dataBinding = {
        filter: (options: { filters: { minValue: number; maxValue: number } }) => {
          return {
            min: options.filters.minValue,
            max: options.filters.maxValue,
          };
        },
      };

      const result = await sandbox.execute(
        '(async () => { const data = await api.filter({ filters: { minValue: 10, maxValue: 100 } }); return JSON.stringify(data); })()',
        { api: dataBinding }
      );

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.result);
      expect(parsed.min).toBe(10);
      expect(parsed.max).toBe(100);
    });
  });

  describe('Execution Time Tracking', () => {
    it('should track execution time', async () => {
      const result = await sandbox.execute('2 + 2');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(1000); // Should be very fast
    });
  });

  describe('Isolation', () => {
    it('should not have access to Node.js globals', async () => {
      const result = await sandbox.execute(`
        typeof process === 'undefined' &&
        typeof require === 'undefined' &&
        typeof __dirname === 'undefined'
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
    });

    it('should not share state between executions', async () => {
      await sandbox.execute('const x = 42');
      const result = await sandbox.execute('typeof x');
      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');
    });
  });
});
