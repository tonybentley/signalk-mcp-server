import ivm from 'isolated-vm';

/**
 * Result of code execution in V8 isolate
 */
export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs: string[];
  executionTime: number;
}

/**
 * Resource limits for isolate execution
 */
export interface SandboxLimits {
  memoryLimitMB?: number;      // Default: 128MB
  timeoutMs?: number;           // Default: 30000ms (30 seconds)
}

/**
 * Bindings that can be injected into isolate context
 * These provide controlled access to external capabilities
 */
export interface SandboxBindings {
  [key: string]: any;
}

/**
 * V8 Isolate-based code execution sandbox
 *
 * Uses isolated-vm to execute agent-written code in a secure V8 isolate.
 * Provides:
 * - Memory isolation (default 128MB limit)
 * - Execution timeout (default 30s)
 * - No network access from sandbox
 * - No filesystem access (except via bindings)
 * - Console output capture
 *
 * Based on Cloudflare's Code Mode architecture:
 * - Fresh isolate per execution (milliseconds startup)
 * - Binding-based access to external systems (RPC-style)
 * - No credentials exposed to sandbox code
 *
 * @example
 * const sandbox = new IsolateSandbox();
 * const result = await sandbox.execute(`
 *   console.log('Hello from isolate');
 *   return 42;
 * `);
 * console.log(result.logs); // ['Hello from isolate']
 * console.log(result.result); // 42
 */
export class IsolateSandbox {
  private limits: Required<SandboxLimits>;

  constructor(limits: SandboxLimits = {}) {
    this.limits = {
      memoryLimitMB: limits.memoryLimitMB || 128,
      timeoutMs: limits.timeoutMs || 30000,
    };
  }

  /**
   * Execute code in a fresh V8 isolate
   *
   * @param code - JavaScript/TypeScript code to execute
   * @param bindings - Optional bindings to inject into isolate context
   * @returns ExecutionResult with output, logs, and timing
   *
   * @example
   * // Simple execution
   * const result = await sandbox.execute('2 + 2');
   * console.log(result.result); // 4
   *
   * // With bindings
   * const result = await sandbox.execute(
   *   'await signalk.getVesselState()',
   *   { signalk: new SignalKBinding() }
   * );
   */
  async execute(
    code: string,
    bindings: SandboxBindings = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    let isolate: ivm.Isolate | null = null;

    try {
      // Create fresh V8 isolate with memory limit
      isolate = new ivm.Isolate({
        memoryLimit: this.limits.memoryLimitMB,
        inspector: false, // No debugging access for security
      });

      // Create execution context
      const context = await isolate.createContext();

      // Inject console.log capture using applySync
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      await jail.set('_consoleLog', new ivm.Reference(function(...args: any[]) {
        logs.push(args.map(arg => String(arg)).join(' '));
      }));

      await context.eval(`
        globalThis.console = {
          log: function(...args) {
            _consoleLog.applySync(undefined, args);
          }
        };
      `);

      // Inject bindings (RPC-style access to external systems)
      for (const [name, binding] of Object.entries(bindings)) {
        await this.injectBinding(context, name, binding);
      }

      // Execute code with timeout
      const script = await isolate.compileScript(code);
      const result = await script.run(context, {
        timeout: this.limits.timeoutMs,
        promise: true, // Support async/await
      });

      // Copy result out of isolate (primitives only by default)
      const finalResult = await this.extractResult(result);

      return {
        success: true,
        result: finalResult,
        logs,
        executionTime: Date.now() - startTime,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        logs,
        executionTime: Date.now() - startTime,
      };

    } finally {
      // Cleanup: dispose isolate (memory freed)
      if (isolate) {
        isolate.dispose();
      }
    }
  }

  /**
   * Inject a binding into the isolate context
   * Bindings are objects with methods that can be called from agent code
   *
   * @private
   */
  private async injectBinding(
    context: ivm.Context,
    name: string,
    binding: any
  ): Promise<void> {
    const jail = context.global;

    // Get all methods from the binding object (including plain object properties)
    const proto = Object.getPrototypeOf(binding);
    const protoMethods = proto && proto !== Object.prototype
      ? Object.getOwnPropertyNames(proto).filter(prop =>
          typeof binding[prop] === 'function' && prop !== 'constructor'
        )
      : [];

    const ownMethods = Object.keys(binding).filter(prop =>
      typeof binding[prop] === 'function'
    );

    const methods = [...new Set([...protoMethods, ...ownMethods])];

    if (methods.length === 0) {
      console.error(`Warning: No methods found for binding '${name}'`);
      return;
    }

    // Create references for each method
    for (const methodName of methods) {
      const method = binding[methodName].bind(binding);
      const refName = `_${name}_${methodName}`;

      await jail.set(refName, new ivm.Reference(async (...args: any[]) => {
        const result = await method(...args);
        // Use ExternalCopy to transfer values across isolate boundary
        return new ivm.ExternalCopy(result);
      }));
    }

    // Create proxy object in isolate that calls the references
    const methodProxies = methods.map(methodName => {
      const refName = `_${name}_${methodName}`;
      return `        ${methodName}: async function(...args) {
          const externalCopy = await ${refName}.apply(undefined, args, { result: { promise: true } });
          return externalCopy.copy();
        }`;
    }).join(',\n');

    await context.eval(`
      globalThis.${name} = {
${methodProxies}
      };
    `);
  }

  /**
   * Extract result from isolate
   * Handles primitives, objects, and arrays
   *
   * @private
   */
  private async extractResult(result: any): Promise<any> {
    if (result === null || result === undefined) {
      return result;
    }

    // If it's an ivm.Reference, try to copy it
    if (result && typeof result.copy === 'function') {
      try {
        return await result.copy();
      } catch {
        // If copy fails, return string representation
        return String(result);
      }
    }

    return result;
  }
}
