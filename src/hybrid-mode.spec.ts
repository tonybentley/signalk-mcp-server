/**
 * Hybrid Mode Unit Tests
 *
 * Tests for the execution mode functionality including:
 * - Tool registration in different modes
 * - execute_code tool functionality
 * - SDK generation and injection
 * - Mode enforcement
 */

import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

// Mock import.meta.url for Jest
jest.mock('url', () => ({
  fileURLToPath: jest.fn(() => '/mocked/path/src/signalk-mcp-server.ts'),
}));

// Mock the path utils
jest.mock('./utils/path-utils.js', () => ({
  getCurrentDirname: jest.fn(() => '/mocked/path/src'),
}));

// Mock path module
jest.mock('path', () => ({
  dirname: jest.fn((p: string) => p.replace(/\/[^/]+$/, '')),
  join: jest.fn((...args: string[]) => args.join('/')),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve(JSON.stringify({ test: 'data' }))),
}));

// Mock isolated-vm for testing
jest.mock('isolated-vm', () => ({
  default: {
    Isolate: jest.fn().mockImplementation(() => ({
      createContext: jest.fn(() => Promise.resolve({
        global: {
          set: jest.fn(() => Promise.resolve(undefined)),
        },
        eval: jest.fn(() => Promise.resolve(undefined)),
      })),
      compileScript: jest.fn(() => Promise.resolve({
        run: jest.fn(() => Promise.resolve(JSON.stringify({ success: true }))),
      })),
    })),
  },
}));

import { SignalKMCPServer } from './signalk-mcp-server.js';
import { SignalKClient } from './signalk-client.js';

// Mock the SignalK client
jest.mock('./signalk-client', () => ({
  SignalKClient: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockImplementation(() => Promise.resolve()),
    getVesselState: jest.fn(),
    getAISTargets: jest.fn(),
    getActiveAlarms: jest.fn(),
    listAvailablePaths: jest.fn(),
    getPathValue: jest.fn(),
    getConnectionStatus: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  })),
}));

// Mock the MCP SDK components
const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn(),
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  ReadResourceRequestSchema: 'ReadResourceRequestSchema',
  ListResourcesRequestSchema: 'ListResourcesRequestSchema',
  ErrorCode: {
    MethodNotFound: -32601,
    InternalError: -32603,
    InvalidRequest: -32600,
  },
  McpError: jest.fn().mockImplementation((...args: any[]) => {
    const [code, message] = args;
    const error = new Error(message);
    (error as any).code = code;
    return error;
  }),
}));

describe('Hybrid Mode', () => {
  let mockSignalKClient: jest.Mocked<SignalKClient>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSignalKClient = {
      on: jest.fn(),
      connect: jest.fn().mockImplementation(() => Promise.resolve()),
      getVesselState: jest.fn(),
      getAISTargets: jest.fn(),
      getActiveAlarms: jest.fn(),
      listAvailablePaths: jest.fn(),
      getPathValue: jest.fn(),
      getConnectionStatus: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    } as any;

    const MockedSignalKClient = jest.mocked(SignalKClient);
    MockedSignalKClient.mockImplementation(() => mockSignalKClient);

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Tool Registration', () => {
    test('should register both legacy and execute_code tools in hybrid mode', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        'ListToolsRequestSchema',
        expect.any(Function)
      );

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      expect(listToolsHandler).toBeDefined();

      const result = listToolsHandler();
      const toolNames = result.tools.map((t: any) => t.name);

      // Should have legacy tools
      expect(toolNames).toContain('get_vessel_state');
      expect(toolNames).toContain('get_ais_targets');
      expect(toolNames).toContain('get_active_alarms');

      // Should have execute_code tool
      expect(toolNames).toContain('execute_code');
    });

    test('should register only legacy tools in tools mode', () => {
      new SignalKMCPServer({ executionMode: 'tools' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const toolNames = result.tools.map((t: any) => t.name);

      // Should have legacy tools
      expect(toolNames).toContain('get_vessel_state');

      // Should NOT have execute_code tool
      expect(toolNames).not.toContain('execute_code');
    });

    test('should register only execute_code tool in code mode', () => {
      new SignalKMCPServer({ executionMode: 'code' });

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const toolNames = result.tools.map((t: any) => t.name);

      // Should NOT have legacy tools
      expect(toolNames).not.toContain('get_vessel_state');

      // Should have execute_code tool
      expect(toolNames).toContain('execute_code');
    });

    test('should default to code mode when executionMode not specified', () => {
      new SignalKMCPServer();

      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();
      const toolNames = result.tools.map((t: any) => t.name);

      // Should only have execute_code in code mode (new default)
      expect(toolNames).toContain('execute_code');
      expect(toolNames).not.toContain('get_vessel_state');
    });
  });

  describe('Mode Enforcement', () => {
    test('should reject execute_code in tools-only mode', async () => {
      new SignalKMCPServer({ executionMode: 'tools' });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'execute_code',
          arguments: { code: 'console.log("test")' },
        },
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        'execute_code tool is not available in tools-only mode'
      );
    });

    test('should reject legacy tools in code-only mode', async () => {
      new SignalKMCPServer({ executionMode: 'code' });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      const request = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      await expect(callToolHandler(request)).rejects.toThrow(
        'Tool get_vessel_state is not available in code-only mode'
      );
    });

    test('should allow both tool types in hybrid mode', async () => {
      mockSignalKClient.getVesselState.mockResolvedValue({
        connected: true,
        context: 'vessels.self',
        timestamp: new Date().toISOString(),
        data: {},
      });

      new SignalKMCPServer({
        executionMode: 'hybrid',
        signalkClient: mockSignalKClient,
      });

      const callToolHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'CallToolRequestSchema'
      )?.[1] as any;

      // Test legacy tool
      const legacyRequest = {
        params: {
          name: 'get_vessel_state',
          arguments: {},
        },
      };

      const legacyResult = await callToolHandler(legacyRequest);
      expect(legacyResult).toBeDefined();
      expect(legacyResult.content[0].text).toBeDefined();

      // Test execute_code tool is accessible (can't fully test without real isolate)
      const codeRequest = {
        params: {
          name: 'execute_code',
          arguments: { code: '(async () => { return JSON.stringify({test: true}); })()' },
        },
      };

      // Should return a result (even if it's an error due to mocking)
      const codeResult = await callToolHandler(codeRequest);
      expect(codeResult).toBeDefined();
      expect(codeResult.content).toBeDefined();
    });
  });

  describe('SDK Generation', () => {
    test('should generate SDK code on initialization in code mode', () => {
      new SignalKMCPServer({ executionMode: 'code' });

      // Verify console.error was called with code execution message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CODE MODE')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Code execution enabled')
      );
    });

    test('should generate SDK code on initialization in hybrid mode', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      // Verify console.error was called with code execution message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('HYBRID MODE')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Code execution enabled')
      );
    });

    test('should not generate SDK code in tools-only mode', () => {
      new SignalKMCPServer({ executionMode: 'tools' });

      // Verify console.error was NOT called with code execution message
      const codeExecutionCalls = consoleErrorSpy.mock.calls.filter((call) =>
        call.some((arg) => String(arg).includes('Code execution enabled'))
      );

      expect(codeExecutionCalls.length).toBe(0);
    });
  });

  describe('Tool Definition Extraction', () => {
    test('should extract tool definitions for SDK generation', () => {
      new SignalKMCPServer({ executionMode: 'hybrid' });

      // Verify tools are registered
      const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
        (call) => call[0] === 'ListToolsRequestSchema'
      )?.[1] as any;

      const result = listToolsHandler();

      // Verify all expected legacy tools are present
      const legacyTools = [
        'get_vessel_state',
        'get_ais_targets',
        'get_active_alarms',
        'list_available_paths',
        'get_path_value',
        'get_connection_status',
        'get_initial_context',
      ];

      const toolNames = result.tools.map((t: any) => t.name);

      legacyTools.forEach((toolName) => {
        expect(toolNames).toContain(toolName);
      });

      // Verify execute_code tool
      expect(toolNames).toContain('execute_code');
    });
  });
});
