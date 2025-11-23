/**
 * Mock for isolated-vm module
 * Used in Jest tests since isolated-vm is a native Node.js addon
 * Uses Node's vm module to provide actual JavaScript execution
 */

const vm = require('vm');

class MockReference {
  constructor(value) {
    this.value = value;
    this._isFunction = typeof value === 'function';
  }

  async copy() {
    return this.value;
  }

  copySync() {
    return this.value;
  }

  async copyInto(options) {
    return this.value;
  }

  copyIntoSync() {
    return this.value;
  }

  // Support for calling functions across isolate boundary
  applySync(thisArg, args = []) {
    if (this._isFunction) {
      return this.value.apply(thisArg, args);
    }
    throw new Error('Not a function');
  }

  async apply(thisArg, args = [], options) {
    if (this._isFunction) {
      return this.value.apply(thisArg, args);
    }
    throw new Error('Not a function');
  }
}

// Helper to create Reference objects
class Reference extends MockReference {
  constructor(value) {
    super(value);
  }
}

class MockContext {
  constructor() {
    this.context = {};
    this.global = {
      set: jest.fn(async (key, value) => {
        // Handle ivm.Reference objects
        if (value && value.applySync) {
          this.context[key] = value;
        } else if (value && value.value !== undefined) {
          this.context[key] = value.value;
        } else {
          this.context[key] = value;
        }
        return Promise.resolve();
      }),
      setSync: jest.fn((key, value) => {
        if (value && value.applySync) {
          this.context[key] = value;
        } else if (value && value.value !== undefined) {
          this.context[key] = value.value;
        } else {
          this.context[key] = value;
        }
      }),
      get: jest.fn(async (key) => {
        return Promise.resolve(new MockReference(this.context[key]));
      }),
      getSync: jest.fn((key) => {
        return new MockReference(this.context[key]);
      }),
      derefInto: jest.fn(() => {
        return this.context;
      })
    };
  }

  async eval(code, options = {}) {
    try {
      const script = new vm.Script(code);
      const result = script.runInNewContext(this.context);
      return new MockReference(result);
    } catch (error) {
      throw error;
    }
  }

  evalSync(code, options = {}) {
    const script = new vm.Script(code);
    const result = script.runInNewContext(this.context);
    return new MockReference(result);
  }
}

class MockScript {
  constructor(isolate, code) {
    this.isolate = isolate;
    this.code = code;
  }

  async run(context, options = {}) {
    try {
      const script = new vm.Script(this.code);
      const result = script.runInNewContext(context.context);
      return new MockReference(result);
    } catch (error) {
      throw error;
    }
  }

  runSync(context, options = {}) {
    const script = new vm.Script(this.code);
    const result = script.runInNewContext(context.context);
    return new MockReference(result);
  }
}

class MockIsolate {
  constructor(options = {}) {
    this.options = options;
  }

  async createContext() {
    return Promise.resolve(new MockContext());
  }

  createContextSync() {
    return new MockContext();
  }

  async compileScript(code, options = {}) {
    return Promise.resolve(new MockScript(this, code));
  }

  compileScriptSync(code, options = {}) {
    return new MockScript(this, code);
  }

  dispose() {
    // No-op for mock
  }
}

// Export default object with Isolate class (CommonJS for Jest)
module.exports = {
  default: {
    Isolate: MockIsolate,
    Reference: Reference
  },
  Isolate: MockIsolate,
  Reference: Reference
};
